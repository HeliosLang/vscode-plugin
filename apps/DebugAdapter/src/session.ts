import { type Site } from "@helios-lang/compiler-utils"
import { hexToBytes, isValidHex } from "@helios-lang/codec-utils"
import {
    decodeUplcData,
    decodeUplcProgramV2FromCbor,
    makeUplcDataValue,
    UplcLogger,
    UplcRuntimeError,
    type CekValue,
    type CekStack,
    type CallSiteInfo,
    type CekMachineSnapshot,
    type CekMachineStepResult,
    type UplcData,
    type UplcProgramV2
} from "@helios-lang/uplc"
import {
    Breakpoint,
    BreakpointEvent,
    ContinuedEvent,
    DebugSession,
    InitializedEvent,
    OutputEvent,
    Source,
    StackFrame,
    StoppedEvent,
    TerminatedEvent,
    Thread,
    Variable
} from "@vscode/debugadapter"
import { DebugProtocol } from "@vscode/debugprotocol"
import { basename, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import { ExpressionEvaluator } from "./expressions"

const THREAD_ID = 1
const RUN_CHUNK_SIZE = 1000

type CekMachine = ReturnType<UplcProgramV2["createCekMachine"]>

type SiteKey = {
    file: string
    line: number
    column: number
}

type StepState = {
    mode: "in" | "over" | "out"
    anchorSite?: SiteKey
    anchorFrameDepth: number
    hasStepped: boolean
}

type SourceBreakpoint = {
    id: number
    line: number
    column?: number
    condition?: string
    site?: Site
}
type DebugFrame = { site?: Site; name: string; stack?: CekStack }

export class HeliosDebugSession extends DebugSession {
    private breakpoints: Map<string, SourceBreakpoint[]>
    private executableSites = new Map<string, Site[]>()
    private evaluator?: ExpressionEvaluator
    private sourceLines = new Map<string, string[]>()
    private frames: DebugFrame[] = []
    private stopOnEntry = false
    private nextBreakpointId: number
    private nextVariablesReference: number
    private variableHandles: Map<
        number,
        DebugProtocol.Variable[] | (() => DebugProtocol.Variable[])
    >
    private activationIds = new WeakMap<CallSiteInfo, number>()
    private nextActivationId = 1

    private configurationDone: boolean
    private machine: CekMachine | undefined
    private lastSnapshot: CekMachineSnapshot | undefined
    private running: boolean
    private pauseRequested: boolean
    private terminated: boolean
    private skipBreakpointKey: string | undefined
    private stoppedBreakpointKey: string | undefined
    private stoppedSite: Site | undefined
    private stepState: StepState | undefined

    constructor(
        obsoleteDebuggerLinesAndColumnsStartAt1?: boolean,
        obsoleteIsServer?: boolean
    ) {
        super(obsoleteDebuggerLinesAndColumnsStartAt1, obsoleteIsServer)
        this.setDebuggerLinesStartAt1(false)
        this.setDebuggerColumnsStartAt1(false)

        this.breakpoints = new Map()
        this.nextBreakpointId = 1
        this.nextVariablesReference = 1
        this.variableHandles = new Map()

        this.configurationDone = false
        this.machine = undefined
        this.lastSnapshot = undefined
        this.running = false
        this.pauseRequested = false
        this.terminated = false
        this.skipBreakpointKey = undefined
        this.stoppedBreakpointKey = undefined
        this.stoppedSite = undefined
        this.stepState = undefined
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        _args: DebugProtocol.InitializeRequestArguments
    ): void {
        response.body = response.body || {}
        response.body.supportsConfigurationDoneRequest = true
        response.body.supportsSetVariable = false
        response.body.supportsEvaluateForHovers = false
        response.body.supportsSteppingGranularity = false
        response.body.supportsConditionalBreakpoints = true
        response.body.supportsStepBack = false

        this.sendResponse(response)
        this.sendEvent(new InitializedEvent())
    }

    protected setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): void {
        const sourceKey = normalizeSourcePath(args.source.path)
        const requestedBreakpoints = args.breakpoints ?? []
        const breakpoints = requestedBreakpoints.map((bp) => ({
            id: this.nextBreakpointId++,
            line: this.convertClientLineToDebugger(bp.line),
            column:
                bp.column === undefined
                    ? undefined
                    : this.convertClientColumnToDebugger(bp.column),
            condition: bp.condition
        }))

        if (sourceKey) {
            this.breakpoints.set(sourceKey, breakpoints)
        }

        response.body = {
            breakpoints: breakpoints.map((bp) =>
                this.resolveBreakpoint(sourceKey, bp)
            )
        }
        this.sendResponse(response)
    }

    protected configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        _args: DebugProtocol.ConfigurationDoneArguments
    ): void {
        this.configurationDone = true
        this.sendResponse(response)
        this.runIfReady()
    }

    protected launchRequest(
        response: DebugProtocol.LaunchResponse,
        argsObj: any
    ): void {
        try {
            const { uplcProgram: rawUplcProgram, args: rawArgs } = argsObj
            const uplcProgram = decodeUplcProgramV2FromCbor(
                decodeHexConfigValue(rawUplcProgram, "uplcProgram")
            )
            this.stopOnEntry = argsObj.stopOnEntry === true
            if (argsObj.debugSources) {
                for (const source of [
                    argsObj.debugSources.main,
                    ...argsObj.debugSources.modules
                ]) {
                    this.sourceLines.set(
                        normalizeSourcePath(source.name),
                        source.content.split("\n")
                    )
                }
            }
            this.evaluator = argsObj.debugSources
                ? new ExpressionEvaluator(argsObj.debugSources)
                : undefined
            const visit = (term: typeof uplcProgram.root) => {
                const site = term.site
                if (
                    site &&
                    isUserSite(site) &&
                    term.kind != "lambda" &&
                    term.kind != "delay"
                ) {
                    const key = normalizeSourcePath(site.file)
                    const sites = this.executableSites.get(key) ?? []
                    if (
                        !sites.some((s) =>
                            sameSiteKey(makeSiteKey(s), makeSiteKey(site))
                        )
                    )
                        sites.push(site)
                    this.executableSites.set(key, sites)
                }
                term.children.forEach(visit)
            }
            visit(uplcProgram.root)

            const args: UplcData[] | undefined = Array.isArray(rawArgs)
                ? rawArgs.map((ra: string) =>
                      decodeUplcData(decodeHexConfigValue(ra, "args"))
                  )
                : undefined

            this.machine = uplcProgram.createCekMachine(
                args ? args.map((a) => makeUplcDataValue(a)) : undefined,
                {
                    logOptions: new DebugLogger(this)
                }
            )
            this.lastSnapshot = this.machine.snapshot()

            for (const [file, breakpoints] of this.breakpoints) {
                for (const bp of breakpoints)
                    this.sendEvent(
                        new BreakpointEvent(
                            "changed",
                            this.resolveBreakpoint(file, bp)
                        )
                    )
            }

            this.sendResponse(response)
            this.runIfReady()
        } catch (e) {
            this.sendErrorResponse(
                response,
                1001,
                `Failed to launch Helios debugger: ${(e as Error).message}`
            )
        }
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [new Thread(THREAD_ID, "UPLC")]
        }
        this.sendResponse(response)
    }

    protected stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ): void {
        const start = args.startFrame ?? 0
        const end = args.levels ? start + args.levels : undefined
        response.body = {
            stackFrames: this.frames
                .map(
                    (frame, i) =>
                        new StackFrame(
                            i + 1,
                            frame.name,
                            frame.site ? makeSource(frame.site) : undefined,
                            frame.site
                                ? this.convertDebuggerLineToClient(
                                      frame.site.line
                                  )
                                : 0,
                            frame.site
                                ? this.convertDebuggerColumnToClient(
                                      this.utf16Column(frame.site)
                                  )
                                : 0
                        )
                )
                .slice(start, end),
            totalFrames: this.frames.length
        }
        this.sendResponse(response)
    }

    protected scopesRequest(
        response: DebugProtocol.ScopesResponse,
        args: DebugProtocol.ScopesArguments
    ): void {
        const frame = this.frames[args.frameId - 1]
        if (!frame) {
            this.sendErrorResponse(
                response,
                1002,
                "Unknown or stale stack frame"
            )
            return
        }
        const variables = this.stackVariables(frame.stack?.values ?? [])

        response.body = {
            scopes: [
                {
                    name: "User",
                    presentationHint: "locals",
                    variablesReference: this.storeVariables(variables.user),
                    namedVariables: variables.user.length,
                    expensive: false
                },
                {
                    name: "Internal",
                    presentationHint: "locals",
                    variablesReference: this.storeVariables(variables.internal),
                    namedVariables: variables.internal.length,
                    expensive: false
                }
            ]
        }
        this.sendResponse(response)
    }

    protected variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments
    ): void {
        const handle = this.variableHandles.get(args.variablesReference)
        const variables =
            typeof handle == "function" ? handle() : (handle ?? [])
        if (typeof handle == "function")
            this.variableHandles.set(args.variablesReference, variables)
        response.body = {
            variables: variables.slice(
                args.start ?? 0,
                args.count ? (args.start ?? 0) + args.count : undefined
            )
        }
        this.sendResponse(response)
    }

    protected evaluateRequest(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments
    ): void {
        try {
            if (this.running || this.terminated)
                throw new Error("Evaluation requires a paused debugger")
            const frame = this.frames[(args.frameId ?? 1) - 1]
            if (!frame?.site)
                throw new Error("No source scope in the selected frame")
            if (!this.evaluator)
                throw new Error(
                    "Launch from a Helios source document to evaluate expressions"
                )
            const result = this.evaluator.evaluate(
                args.expression,
                frame.site,
                frame.stack?.values ?? []
            )
            response.body = {
                result: String(result.value),
                type: result.type,
                variablesReference: 0
            }
            this.sendResponse(response)
        } catch (e) {
            this.sendErrorResponse(response, 1003, (e as Error).message)
        }
    }

    private resolveBreakpoint(
        file: string,
        bp: SourceBreakpoint
    ): DebugProtocol.Breakpoint {
        const sites = (this.executableSites.get(file) ?? []).filter(
            (s) =>
                s.line == bp.line &&
                (bp.column === undefined || this.utf16Column(s) >= bp.column)
        )
        if (bp.column !== undefined) sites.sort((a, b) => a.column - b.column)
        bp.site = sites[0]
        const result: DebugProtocol.Breakpoint = new Breakpoint(
            !!bp.site,
            this.convertDebuggerLineToClient(bp.site?.line ?? bp.line),
            bp.site
                ? this.convertDebuggerColumnToClient(this.utf16Column(bp.site))
                : undefined
        )
        result.id = bp.id
        if (!bp.site)
            result.message = this.machine
                ? "No executable expression on this line"
                : "Pending program launch"
        if (bp.condition && this.machine && !this.evaluator) {
            result.verified = false
            result.message =
                "Conditional breakpoints require Helios source context"
            bp.site = undefined
        }
        return result
    }

    private utf16Column(site: Site): number {
        const line = this.sourceLines.get(normalizeSourcePath(site.file))?.[
            site.line
        ]
        // Helios counts Unicode code points; DAP/VS Code counts UTF-16 units.
        return line === undefined
            ? site.column
            : [...line].slice(0, site.column).join("").length
    }

    protected continueRequest(
        response: DebugProtocol.ContinueResponse,
        _args: DebugProtocol.ContinueArguments
    ): void {
        this.stepState = undefined
        this.resumeExecution(response, { allThreadsContinued: true })
    }

    protected nextRequest(
        response: DebugProtocol.NextResponse,
        _args: DebugProtocol.NextArguments
    ): void {
        this.stepState = this.makeStepState("over")
        this.resumeExecution(response)
    }

    protected stepInRequest(
        response: DebugProtocol.StepInResponse,
        _args: DebugProtocol.StepInArguments
    ): void {
        this.stepState = this.makeStepState("in")
        this.resumeExecution(response)
    }

    protected stepOutRequest(
        response: DebugProtocol.StepOutResponse,
        _args: DebugProtocol.StepOutArguments
    ): void {
        this.stepState = this.makeStepState("out")
        this.resumeExecution(response)
    }

    private resumeExecution(
        response:
            | DebugProtocol.ContinueResponse
            | DebugProtocol.NextResponse
            | DebugProtocol.StepInResponse
            | DebugProtocol.StepOutResponse,
        body?: DebugProtocol.ContinueResponse["body"]
    ): void {
        if (!this.machine || this.running || this.terminated) {
            this.sendErrorResponse(
                response,
                1004,
                "Execution requires a paused debugger"
            )
            return
        }
        if (this.stoppedBreakpointKey) {
            this.skipBreakpointKey = this.stoppedBreakpointKey
        }

        this.stoppedBreakpointKey = undefined
        this.stoppedSite = undefined
        this.pauseRequested = false
        this.frames = []
        this.variableHandles.clear()

        if (body) {
            response.body = body
        }

        this.sendResponse(response)
        this.sendEvent(new ContinuedEvent(THREAD_ID, true))
        this.runIfReady()
    }

    protected pauseRequest(
        response: DebugProtocol.PauseResponse,
        _args: DebugProtocol.PauseArguments
    ): void {
        this.pauseRequested = true
        this.sendResponse(response)
    }

    protected disconnectRequest(
        response: DebugProtocol.DisconnectResponse,
        _args: DebugProtocol.DisconnectArguments
    ): void {
        this.terminated = true
        this.sendResponse(response)
    }

    private runIfReady(): void {
        if (
            !this.configurationDone ||
            !this.machine ||
            this.running ||
            this.terminated
        ) {
            return
        }

        this.running = true
        setImmediate(() => this.runChunk())
    }

    private runChunk(): void {
        const machine = this.machine
        if (!machine || this.terminated) {
            this.running = false
            return
        }

        for (let i = 0; i < RUN_CHUNK_SIZE; i++) {
            const snapshot = machine.snapshot()
            this.lastSnapshot = snapshot

            if (this.stopOnEntry && executionSite(snapshot)) {
                this.stopOnEntry = false
                this.stopExecution("entry", undefined, executionSite(snapshot))
                return
            }

            if (this.pauseRequested) {
                this.stopExecution("pause")
                return
            }

            const breakpoint = this.matchingBreakpoint(snapshot)
            if (breakpoint) {
                if (this.skipBreakpointKey != breakpoint.key) {
                    this.skipBreakpointKey = breakpoint.key
                    if (breakpoint.condition) {
                        try {
                            if (!this.evaluator)
                                throw new Error("No Helios source context")
                            const result = this.evaluator.evaluate(
                                breakpoint.condition,
                                breakpoint.site,
                                snapshot.stack?.values ?? []
                            )
                            if (result.type != "Bool")
                                throw new Error(
                                    "Breakpoint condition must return Bool"
                                )
                            if (String(result.value) == "false") continue
                        } catch (e) {
                            this.sendEvent(
                                new OutputEvent(
                                    `Breakpoint condition failed: ${(e as Error).message}\n`,
                                    "stderr"
                                )
                            )
                        }
                    }
                    this.stopExecution(
                        "breakpoint",
                        breakpoint.key,
                        breakpoint.site
                    )
                    return
                }
            } else if (executionSite(snapshot)) {
                this.skipBreakpointKey = undefined
            }

            if (this.stepState?.hasStepped) {
                const site = this.matchingStepSite(snapshot)

                if (site) {
                    this.stopExecution("step", undefined, site)
                    return
                }
            }

            const stepResult = machine.step()
            if (stepResult.kind == "completed" || stepResult.kind == "error") {
                this.finish(stepResult)
                return
            }

            if (this.stepState) {
                this.stepState.hasStepped = true
            }
        }

        setImmediate(() => this.runChunk())
    }

    private stopExecution(
        reason: "breakpoint" | "pause" | "step" | "entry",
        breakpointKey?: string,
        site?: Site
    ): void {
        this.running = false
        this.pauseRequested = false
        this.stepState = undefined
        this.stoppedBreakpointKey = breakpointKey
        this.stoppedSite = site
        this.frames = makeDebugFrames(this.lastSnapshot, site)
        this.variableHandles.clear()
        const event: DebugProtocol.StoppedEvent = new StoppedEvent(
            reason,
            THREAD_ID
        )
        event.body.allThreadsStopped = true
        if (breakpointKey)
            event.body.hitBreakpointIds = [
                Number(breakpointKey.split(":").slice(-2)[0])
            ]
        this.sendEvent(event)
    }

    private finish(
        stepResult: Extract<
            CekMachineStepResult,
            { kind: "completed" | "error" }
        >
    ): void {
        this.running = false
        this.terminated = true

        const result = stepResult.result
        if ("left" in result.result) {
            const error = new UplcRuntimeError(
                result.result.left.error,
                result.result.left.callSites
            )

            if (error.stack) {
                this.sendEvent(new OutputEvent(error.stack))
            }

            this.sendEvent(new OutputEvent(error.toString()))
        } else {
            this.sendEvent(new OutputEvent(result.result.right.toString()))
        }

        this.sendEvent(new TerminatedEvent())
    }

    private matchingBreakpoint(
        snapshot: CekMachineSnapshot
    ): { key: string; site: Site; condition?: string } | undefined {
        const site = executionSite(snapshot)
        if (!site) {
            return undefined
        }

        const sitePath = normalizeSourcePath(site.file)
        const line = site.line

        for (const bp of this.breakpoints.get(sitePath) ?? []) {
            if (
                bp.site &&
                bp.site.line == line &&
                (bp.column === undefined || bp.site.column == site.column)
            ) {
                const activation = [...(snapshot.stack?.callSites ?? [])]
                    .reverse()
                    .find(
                        (call) =>
                            call.functionName &&
                            !call.functionName.startsWith("<") &&
                            !call.functionName.startsWith("__")
                    )
                let activationId = 0
                if (activation) {
                    activationId =
                        this.activationIds.get(activation) ??
                        this.nextActivationId++
                    this.activationIds.set(activation, activationId)
                }
                return {
                    key: `${sitePath}:${line}:${bp.id}:${activationId}`,
                    site,
                    condition: bp.condition
                }
            }
        }

        return undefined
    }

    private makeStepState(mode: StepState["mode"]): StepState {
        const snapshot = this.snapshot()

        return {
            mode,
            anchorSite: this.stoppedSite
                ? makeSiteKey(this.stoppedSite)
                : undefined,
            anchorFrameDepth: makeDebugFrames(snapshot, this.stoppedSite)
                .length,
            hasStepped: false
        }
    }

    private matchingStepSite(snapshot: CekMachineSnapshot): Site | undefined {
        const stepState = this.stepState
        const site = executionSite(snapshot)

        if (!stepState || !site) {
            return undefined
        }

        const siteKey = makeSiteKey(site)

        if (
            stepState.anchorSite &&
            sameSiteKey(siteKey, stepState.anchorSite)
        ) {
            return undefined
        }

        if (stepState.mode == "in") {
            return site
        } else if (stepState.mode == "over") {
            return makeDebugFrames(snapshot, site).length <=
                stepState.anchorFrameDepth
                ? site
                : undefined
        } else {
            return makeDebugFrames(snapshot, site).length <
                stepState.anchorFrameDepth
                ? site
                : undefined
        }
    }

    private snapshot(): CekMachineSnapshot | undefined {
        this.lastSnapshot = this.machine?.snapshot() ?? this.lastSnapshot
        return this.lastSnapshot
    }

    private storeVariables(
        variables: DebugProtocol.Variable[] | (() => DebugProtocol.Variable[])
    ): number {
        const ref = this.nextVariablesReference++
        this.variableHandles.set(ref, variables)
        return ref
    }

    private stackVariables(values: CekValue[]): {
        user: DebugProtocol.Variable[]
        internal: DebugProtocol.Variable[]
    } {
        const variables = {
            user: [] as DebugProtocol.Variable[],
            internal: [] as DebugProtocol.Variable[]
        }
        // Runtime stacks can retain shadowed bindings. Match expression
        // evaluation by displaying only the nearest (last) user binding.
        const nearestBindings = new Map<string, number>()
        values.forEach((value, i) => {
            if (!isInternalStackValue(value))
                nearestBindings.set(value.name!, i)
        })

        values.forEach((value, i) => {
            if (
                !isInternalStackValue(value) &&
                nearestBindings.get(value.name!) != i
            )
                return
            const name = value.name ?? i.toString()
            const variable = new Variable(name, formatCekValue(value))
            if ("value" in value) {
                const children = valueChildren(value.value)
                if (children.length)
                    variable.variablesReference = this.storeVariables(() =>
                        children.map(([name, value]) =>
                            this.childVariable(name, value)
                        )
                    )
            } else if ("lambda" in value || "delay" in value) {
                const stack =
                    "lambda" in value ? value.lambda.stack : value.delay.stack
                variable.variablesReference = this.storeVariables(
                    () => this.stackVariables(stack.values).user
                )
            }

            if (isInternalStackValue(value)) {
                variables.internal.push(variable)
            } else {
                variables.user.push(variable)
            }
        })

        return variables
    }

    private childVariable(
        name: string,
        value: unknown
    ): DebugProtocol.Variable {
        const variable = new Variable(name, truncateValue(safeToString(value)))
        const children = valueChildren(value)
        if (children.length)
            variable.variablesReference = this.storeVariables(() =>
                children.map(([name, value]) => this.childVariable(name, value))
            )
        return variable
    }
}

function valueChildren(value: unknown): [string, unknown][] {
    const kind = getObjectProperty(value, "kind")
    if (kind == "data") return valueChildren(getObjectProperty(value, "value"))
    const items =
        getObjectProperty(value, "items") ?? getObjectProperty(value, "fields")
    if (Array.isArray(items)) return items.map((item, i) => [String(i), item])
    if (Array.isArray(value)) return value.map((item, i) => [String(i), item])
    return []
}

function decodeHexConfigValue(value: unknown, propertyName: string): number[] {
    if (typeof value != "string" || !isValidHex(value)) {
        throw new Error(`Invalid ${propertyName}: expected a hex string`)
    }

    return hexToBytes(value)
}

function isUserSite(site: Site): boolean {
    return (
        !!site.file &&
        !site.file.startsWith("::") &&
        !site.file.startsWith("__")
    )
}

// A CEK reduction is bookkeeping, not another visit to the call expression.
// Only stop at terms actually being evaluated; fallback call sites otherwise
// send the cursor backwards when an argument or function finishes.
function executionSite(snapshot: CekMachineSnapshot): Site | undefined {
    const term = snapshot.currentTerm
    if (termKind(term) == "lambda" || termKind(term) == "delay")
        return undefined
    const site = term?.site
    return site && isUserSite(site) ? site : undefined
}

function makeDebugFrames(
    snapshot: CekMachineSnapshot | undefined,
    stoppedSite?: Site
): DebugFrame[] {
    if (!snapshot) return []
    const stack = snapshot.stack
    const frames: DebugFrame[] = [
        {
            site: stoppedSite ?? executionSite(snapshot),
            name: frameName(stack),
            stack
        }
    ]
    for (const call of [...(stack?.callSites ?? [])].reverse()) {
        if (
            !call.site ||
            !isUserSite(call.site) ||
            !call.stack ||
            !call.functionName ||
            call.functionName.startsWith("<") ||
            call.functionName.startsWith("__")
        )
            continue
        const previous = frames[frames.length - 1]
        if (
            previous.stack === call.stack &&
            previous.site &&
            sameSiteKey(makeSiteKey(previous.site), makeSiteKey(call.site))
        )
            continue
        frames.push({
            site: call.site,
            name: frameName(call.stack),
            stack: call.stack
        })
    }
    return frames
}

function frameName(stack?: CekStack): string {
    return (
        [...(stack?.callSites ?? [])]
            .reverse()
            .find(
                (call) =>
                    call.functionName &&
                    !call.functionName.startsWith("__") &&
                    !call.functionName.startsWith("<")
            )?.functionName ?? "Helios"
    )
}

function makeSource(site: Site): Source {
    const sourcePath = normalizeSourcePath(site.file)
    const displayPath = sourcePath || site.file

    return new Source(
        basename(displayPath) || site.file,
        displayPath,
        undefined
    )
}

function normalizeSourcePath(path: string | undefined): string {
    if (!path) {
        return ""
    }

    try {
        if (path.startsWith("file://")) {
            return normalize(fileURLToPath(path))
        }
    } catch (_e) {
        return path
    }

    return normalize(path)
}

function makeSiteKey(site: Site): SiteKey {
    return {
        file: normalizeSourcePath(site.file) || site.file,
        line: site.line,
        column: site.column
    }
}

function sameSiteKey(a: SiteKey, b: SiteKey): boolean {
    return a.file == b.file && a.line == b.line && a.column == b.column
}

function safeToString(value: unknown): string {
    if (value === undefined) {
        return "<undefined>"
    }

    try {
        return String(value)
    } catch (_e) {
        return "<unprintable>"
    }
}

function formatCekValue(value: CekValue): string {
    if ("value" in value) {
        return formatUplcValue(value.value)
    } else if ("lambda" in value) {
        const argName = value.lambda.argName ? ` ${value.lambda.argName}` : ""

        return `<function${argName}>`
    } else if ("delay" in value) {
        return "<delayed value>"
    } else {
        const args = value.builtin.args.length
        const forces = value.builtin.forceCount

        return `<builtin ${value.builtin.name}; args=${args}; forces=${forces}>`
    }
}

function isInternalStackValue(value: CekValue): boolean {
    return (
        !value.name || value.name.startsWith("__") || value.name.startsWith("<")
    )
}

function formatUplcValue(value: unknown): string {
    const type = getObjectProperty(value, "type")
    const rendered = safeToString(value)

    if (type) {
        return truncateValue(`${safeToString(type)} ${rendered}`)
    } else {
        return truncateValue(rendered)
    }
}

function truncateValue(value: string): string {
    const maxLength = 240

    return value.length > maxLength
        ? `${value.slice(0, maxLength - 1)}...`
        : value
}

function termKind(term: unknown): string | undefined {
    return typeof term == "object" &&
        term !== null &&
        "kind" in term &&
        typeof term.kind == "string"
        ? term.kind
        : undefined
}

function getObjectProperty(value: unknown, key: string): unknown {
    return typeof value == "object" && value !== null && key in value
        ? (value as Record<string, unknown>)[key]
        : undefined
}

class DebugLogger implements UplcLogger {
    adapter: HeliosDebugSession
    lastMessage_: string

    constructor(adapter: HeliosDebugSession) {
        this.adapter = adapter
        this.lastMessage_ = ""
    }

    logError(msg: string, site: Site | undefined = undefined) {
        this.adapter.sendEvent(
            new OutputEvent((site ? site.toString() + ": " : ": ") + msg + "\n")
        )
    }

    logPrint(msg: string, site: Site | undefined = undefined) {
        this.adapter.sendEvent(
            new OutputEvent((site ? site.toString() + ": " : "") + msg + "\n")
        )
    }

    get lastMessage() {
        return this.lastMessage_
    }
}
