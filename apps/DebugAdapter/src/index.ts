import { type Site } from "@helios-lang/compiler-utils"
import { hexToBytes, isValidHex } from "@helios-lang/codec-utils"
import {
    decodeUplcData,
    decodeUplcProgramV2FromCbor,
    makeUplcDataValue,
    UplcLogger,
    UplcRuntimeError,
    type CekValue,
    type CekMachineSnapshot,
    type CekMachineStepResult,
    type UplcData,
    type UplcProgramV2
} from "@helios-lang/uplc"
import {
    Breakpoint,
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

const THREAD_ID = 1
const RUN_CHUNK_SIZE = 1000

type CekMachine = ReturnType<UplcProgramV2["createCekMachine"]>

class HeliosDebugSession extends DebugSession {
    private breakpoints: Map<string, Set<number>>
    private nextBreakpointId: number
    private nextVariablesReference: number
    private variableHandles: Map<number, DebugProtocol.Variable[]>

    private configurationDone: boolean
    private machine: CekMachine | undefined
    private lastSnapshot: CekMachineSnapshot | undefined
    private running: boolean
    private pauseRequested: boolean
    private terminated: boolean
    private skipBreakpointKey: string | undefined
    private stoppedBreakpointKey: string | undefined
    private stoppedSite: Site | undefined

    constructor(
        obsoleteDebuggerLinesAndColumnsStartAt1?: boolean,
        obsoleteIsServer?: boolean
    ) {
        super(obsoleteDebuggerLinesAndColumnsStartAt1, obsoleteIsServer)

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
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        _args: DebugProtocol.InitializeRequestArguments
    ): void {
        response.body = response.body || {}
        response.body.supportsConfigurationDoneRequest = true
        response.body.supportsSetVariable = false
        response.body.supportsEvaluateForHovers = false

        this.sendResponse(response)
        this.sendEvent(new InitializedEvent())
    }

    protected setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): void {
        const sourceKey = normalizeSourcePath(args.source.path)
        const requestedBreakpoints = args.breakpoints ?? []
        const lines = new Set(
            requestedBreakpoints.map((bp) =>
                this.convertClientLineToDebugger(bp.line)
            )
        )

        if (sourceKey) {
            this.breakpoints.set(sourceKey, lines)
        }

        response.body = {
            breakpoints: requestedBreakpoints.map((bp) => {
                const breakpoint = new Breakpoint(true, bp.line)
                breakpoint.setId(this.nextBreakpointId++)
                return breakpoint
            })
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

    protected threadsRequest(
        response: DebugProtocol.ThreadsResponse
    ): void {
        response.body = {
            threads: [new Thread(THREAD_ID, "UPLC")]
        }
        this.sendResponse(response)
    }

    protected stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        _args: DebugProtocol.StackTraceArguments
    ): void {
        const snapshot = this.snapshot()
        const term = snapshot?.currentTerm
        const site = this.stoppedSite ?? term?.site
        const source = site ? makeSource(site) : undefined

        response.body = {
            stackFrames: [
                new StackFrame(
                    1,
                    site?.description ?? termKind(term) ?? "UPLC",
                    source,
                    this.convertDebuggerLineToClient((site?.line ?? 0) + 1),
                    this.convertDebuggerColumnToClient((site?.column ?? 0) + 1)
                )
            ],
            totalFrames: 1
        }
        this.sendResponse(response)
    }

    protected scopesRequest(
        response: DebugProtocol.ScopesResponse,
        _args: DebugProtocol.ScopesArguments
    ): void {
        this.variableHandles.clear()
        this.nextVariablesReference = 1
        const variables = this.stackVariables()

        response.body = {
            scopes: [
                {
                    name: "",
                    presentationHint: "locals",
                    variablesReference: this.storeVariables(variables),
                    namedVariables: variables.length,
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
        response.body = {
            variables: this.variableHandles.get(args.variablesReference) ?? []
        }
        this.sendResponse(response)
    }

    protected continueRequest(
        response: DebugProtocol.ContinueResponse,
        _args: DebugProtocol.ContinueArguments
    ): void {
        if (this.stoppedBreakpointKey) {
            this.skipBreakpointKey = this.stoppedBreakpointKey
        }

        this.stoppedBreakpointKey = undefined
        this.stoppedSite = undefined
        this.pauseRequested = false
        response.body = { allThreadsContinued: true }
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

            if (this.pauseRequested) {
                this.stopExecution("pause")
                return
            }

            const breakpoint = this.matchingBreakpoint(snapshot)
            if (breakpoint) {
                if (this.skipBreakpointKey != breakpoint.key) {
                    this.stopExecution(
                        "breakpoint",
                        breakpoint.key,
                        breakpoint.site
                    )
                    return
                }
            } else {
                this.skipBreakpointKey = undefined
            }

            const stepResult = machine.step()
            if (stepResult.kind == "completed" || stepResult.kind == "error") {
                this.finish(stepResult)
                return
            }
        }

        setImmediate(() => this.runChunk())
    }

    private stopExecution(
        reason: "breakpoint" | "pause",
        breakpointKey?: string,
        site?: Site
    ): void {
        this.running = false
        this.pauseRequested = false
        this.stoppedBreakpointKey = breakpointKey
        this.stoppedSite = site
        this.sendEvent(new StoppedEvent(reason, THREAD_ID))
    }

    private finish(stepResult: Extract<
        CekMachineStepResult,
        { kind: "completed" | "error" }
    >): void {
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
    ): { key: string; site: Site } | undefined {
        const site = snapshot.activeSite
        if (!site) {
            return undefined
        }

        const sitePath = normalizeSourcePath(site.file)
        const line = site.line + 1

        for (const [sourcePath, lines] of this.breakpoints) {
            if (
                lines.has(line) &&
                (sourcePath == sitePath || sourcePath == site.file)
            ) {
                return { key: `${sitePath}:${line}`, site }
            }
        }

        return undefined
    }

    private snapshot(): CekMachineSnapshot | undefined {
        this.lastSnapshot = this.machine?.snapshot() ?? this.lastSnapshot
        return this.lastSnapshot
    }

    private storeVariables(variables: DebugProtocol.Variable[]): number {
        const ref = this.nextVariablesReference++
        this.variableHandles.set(ref, variables)
        return ref
    }

    private stackVariables(): DebugProtocol.Variable[] {
        const values = this.snapshot()?.stack?.values ?? []

        return values
            .map((value, i) => ({ value, i }))
            .filter(({ value }) => isVisibleStackValue(value))
            .map(({ value, i }) => {
                const name = value.name ? `${i}: ${value.name}` : i.toString()
                return new Variable(name, formatCekValue(value))
            })
    }
}

function decodeHexConfigValue(value: unknown, propertyName: string): number[] {
    if (typeof value != "string" || !isValidHex(value)) {
        throw new Error(`Invalid ${propertyName}: expected a hex string`)
    }

    return hexToBytes(value)
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
        const argName = value.lambda.argName
            ? ` ${value.lambda.argName}`
            : ""

        return truncateValue(
            `<function${argName}> ${safeToString(value.lambda.term)}`
        )
    } else if ("delay" in value) {
        return truncateValue(`<delay> ${safeToString(value.delay.term)}`)
    } else {
        const args = value.builtin.args.length
        const forces = value.builtin.forceCount

        return `<builtin ${value.builtin.name}; args=${args}; forces=${forces}>`
    }
}

function isVisibleStackValue(value: CekValue): boolean {
    const name = value.name

    return !name || !name.startsWith("__") || name == "__CONTEXT"
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

DebugSession.run(HeliosDebugSession)
