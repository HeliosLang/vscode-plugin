import { Schema } from "effect"
import {
    type FileViewContext,
    type EntryPointViewContext,
    GoToErrorEvent,
    SelectEntryPointEvent,
    ChangeArgValueEvent
} from "schemas"
import {
    type ExtensionContext,
    WebviewViewProvider,
    WebviewView,
    WebviewViewResolveContext,
    CancellationToken,
    commands,
    window,
    debug,
    workspace,
    TextDocument,
    Uri,
    TextDocumentShowOptions,
    TextEditor,
    TextEditorRevealType,
    Position,
    Range
} from "vscode"
import { bytesToHex, encodeUtf8, hexToBytes } from "@helios-lang/codec-utils"
import { Program } from "@helios-lang/compiler"
import { type ErrorCollector } from "@helios-lang/compiler-utils"
import { blake2b } from "@helios-lang/crypto"
import {
    boolToUplcData,
    makeByteArrayData,
    makeConstrData,
    makeIntData,
    makeListData,
    makeMapData,
    type UplcData,
    type UplcProgramV2
} from "@helios-lang/uplc"
import { Cache } from "./cache"
import { log } from "./log"
import { isHeliosExt } from "./repository"
import { decodeUplcData } from "@helios-lang/uplc"

type UPLCProgramAndArgs = {
    args: UplcData[] | undefined // undefined is used for consts that don't depend on script context
    uplcProgram: UplcProgramV2
}

const REL_VIEW_PATH = ["dist", "ArgsView", "index.html"]

const Events = Schema.Union(
    GoToErrorEvent,
    SelectEntryPointEvent,
    ChangeArgValueEvent
)

/**
 * Display
 */
export class EntryPointAndArgumentsViewProvider implements WebviewViewProvider {
    private context: ExtensionContext
    #view: WebviewView | undefined
    #activeAST: Program | undefined
    #entryPoint: string | undefined
    #argValues: Record<string, string>
    #scriptContext: string
    #fileName: string
    #currentScript: string

    constructor(context: ExtensionContext) {
        this.context = context
        this.#view = undefined
        this.#activeAST = undefined
        this.#entryPoint = undefined
        this.#argValues = {}
        this.#scriptContext = ""
        this.#currentScript = ""
        this.#fileName = ""
    }

    get uplcProgramAndArgs(): UPLCProgramAndArgs | undefined {
        const entryPoint = this.#entryPoint

        if (!entryPoint) {
            // TODO: display error message in view
            return undefined
        }

        debug.activeDebugConsole.appendLine(`Compiling ${entryPoint}...`)

        const uplcProgram = this.compileEntryPoint()

        if (!uplcProgram) {
            debug.activeDebugConsole.appendLine(
                `Compilation of ${entryPoint} failed`
            )
            return undefined
        }

        // prepare the args
        debug.activeDebugConsole.appendLine(`Preparing arguments...`)

        const args = this.genUplcDataArgs()

        if (!args) {
            debug.activeDebugConsole.appendLine(`Argument preparation failed`)
            return undefined
        }

        return {
            args:
                args.length > 0
                    ? args
                    : this.entryPointIsConst()
                      ? undefined
                      : args, // TODO: zero args is different from undefined though for const
            uplcProgram
        }
    }

    resolveWebviewView(
        view: WebviewView,
        context: WebviewViewResolveContext<any>,
        _token: CancellationToken
    ) {
        this.#view = view

        this.#view.webview.options = {
            enableScripts: true
        }

        workspace.fs
            .readFile(Uri.joinPath(this.context.extensionUri, ...REL_VIEW_PATH))
            .then((content) => {
                view.webview.html = new TextDecoder("utf-8").decode(content)
            })

        this.#view.webview.onDidReceiveMessage(async (event: unknown) => {
            try {
                const e = Schema.decodeUnknownSync(Events)(event)

                switch (e.kind) {
                    case "ChangeArgValueEvent":
                        this.setArgValue(e.name, e.type, e.value)
                        break
                    case "GoToErrorEvent":
                        this.goToError(e.uri)
                        break
                    case "SelectEntryPointEvent":
                        this.setEntryPoint(e.name)
                        break
                }
            } catch (e) {
                console.error(`invalid event (${(e as Error).message})`)
            }
        })
    }

    private goToError(rawUri: string) {
        const e = this.#activeAST?.errors.errors.find(
            (e) => e.site.file == rawUri
        )

        const uri = Uri.parse(rawUri)

        if (e) {
            focusOrOpenTextEditorAtPos(uri, {
                line: e.site.line + 1,
                column: e.site.column + 1
            })
        } else {
            focusOrOpenTextEditor(uri)
        }
    }

    reset() {
        this.#view?.webview.postMessage({
            command: "reset"
        })
    }

    private setArgValue(name: string, type: string, value: string | undefined) {
        if (value == undefined) {
            if (name in this.#argValues) {
                delete this.#argValues[name]
            }
        } else {
            // TODO: take type int account (differnt type => delete value)
            this.#argValues[name] = value
        }
    }

    setScriptContext(ctx: string) {
        this.#scriptContext = ctx
    }

    setCurrentScript(name: string) {
        this.#currentScript = name
    }

    setAST(fileName: string, ast: Program | undefined) {
        this.#activeAST = ast
        this.#fileName = fileName

        if (!ast) {
            this.postFileViewContext({
                kind: "FileViewContext",
                uri: "",
                purpose: "",
                allValidatorNames: [],
                errorUris: [],
                isLoading: true,
                entryPoints: []
            })

            return
        }

        let errors: string[] = collectErrorFiles(ast?.errors)

        // TODO: send a message to update the html

        // send the list of entrypoints
        let entryPoints: string[] = []
        const key = ast.entryPoint.mainModule.name.value

        if (errors.length == 0) {
            if (key in ast.userFunctions) {
                entryPoints = Object.keys(ast.userFunctions[key])
            }

            if (ast.entryPoint.purpose != "module" && ast.entryPoint.mainFunc) {
                entryPoints.push("main")
            }
        }

        const validatorNames = Object.keys(ast.props.validatorTypes ?? {})

        this.postFileViewContext({
            kind: "FileViewContext",
            uri: fileName,
            purpose: ast.purpose,
            allValidatorNames: validatorNames,
            errorUris: errors, // paths to helios scripts containing compilation errors
            isLoading: false,
            entryPoints
        })
    }

    private postFileViewContext(context: FileViewContext) {
        this.#view?.webview?.postMessage(context)
    }

    private getArgs():
        | {
              args: { name: string; type: string }[]
              requiresScriptContext: boolean
              requiresCurrentScript: boolean
          }
        | undefined {
        if (!this.#activeAST) {
            return undefined
        }

        if (this.#entryPoint == "main") {
            // main function that don't actually depend on the ScriptContext are rare and shouldn't exist
            return {
                args: this.#activeAST.entryPoint.mainFunc.args.map((a) => ({
                    name: a.name.value,
                    type: a.type.toString()
                })),
                requiresScriptContext: true,
                requiresCurrentScript: false
            }
        }

        const key = this.#activeAST.entryPoint.mainModule.name.value

        if (!(key in this.#activeAST.userFunctions)) {
            return undefined
        }

        if (!this.#entryPoint) {
            return undefined
        }

        const userFn = this.#activeAST.userFunctions[key][this.#entryPoint]

        // assume that by default the userFunc depends on the script context
        let requiresScriptContext = true
        let requiresCurrentScript = false

        if (this.#activeAST.props.validatorTypes) {
            const validatorTypes = this.#activeAST.props.validatorTypes

            const { requiresScriptContext: rsc, requiresCurrentScript: rcs } =
                userFn.toIR({
                    hashDependencies: genDummyHashes(
                        Object.keys(validatorTypes)
                    ),
                    validatorTypes: validatorTypes,
                    optimize: false
                })

            requiresScriptContext = rsc

            if (
                this.#activeAST.purpose == "module" ||
                this.#activeAST.purpose.includes("test")
            ) {
                requiresCurrentScript = rcs
            }
        }

        console.log(this.#entryPoint, requiresCurrentScript)

        try {
            const constStmnt = userFn.mainConst

            return {
                args: [],
                requiresScriptContext,
                requiresCurrentScript
            }
        } catch (_e) {
            const fnStmnt = userFn.mainFunc

            return {
                args: fnStmnt.args.map((a) => ({
                    name: a.name.value,
                    type: a.type.toString()
                })),
                requiresScriptContext,
                requiresCurrentScript
            }
        }
    }

    entryPointIsConst(): boolean {
        if (!this.#activeAST) {
            return false
        }

        if (this.#entryPoint == "main") {
            return false
        }

        const key = this.#activeAST.entryPoint.mainModule.name.value

        if (!(key in this.#activeAST.userFunctions)) {
            return false
        }

        if (!this.#entryPoint) {
            return false
        }

        const userFn = this.#activeAST.userFunctions[key][this.#entryPoint]

        try {
            const constStmnt = userFn.mainConst

            return true
        } catch (_e) {}

        return false
    }

    // this sets the arguments
    setEntryPoint(entryPoint: string) {
        this.#entryPoint = entryPoint

        const args = this.getArgs()

        if (args) {
            this.setArgNames(
                args.args,
                args.requiresScriptContext,
                args.requiresCurrentScript
            )
        }
    }

    // TODO: compile with source map
    compileEntryPoint(): UplcProgramV2 | undefined {
        if (!this.#entryPoint) {
            return undefined
        }

        if (!this.#activeAST) {
            return undefined
        }

        const validatorTypes = this.#activeAST.props.validatorTypes

        if (!validatorTypes) {
            return undefined
        }

        const hashDependencies = genDummyHashes(Object.keys(validatorTypes))

        if (this.#entryPoint == "main") {
            return this.#activeAST.compile({
                optimize: false,
                onCompileUserFunc: undefined,
                hashDependencies: hashDependencies
            })
        }

        const key = this.#activeAST.entryPoint.mainModule.name.value

        if (!(key in this.#activeAST.userFunctions)) {
            return undefined
        }

        const userFn = this.#activeAST.userFunctions[key][this.#entryPoint]

        return userFn.compile({
            optimize: false,
            hashDependencies,
            validatorTypes
        })
    }

    genUplcDataArgs(): UplcData[] | undefined {
        const args = this.getArgs()

        if (!args) {
            return undefined
        }

        const result: UplcData[] = []

        for (let arg of args.args) {
            const argName = arg.name

            if (argName == "_") {
                result.push(makeIntData(0))
            } else {
                const rawValue = this.#argValues[argName]

                if (rawValue == "" || rawValue == undefined) {
                    // TODO: display error in view
                    return undefined
                }

                if (rawValue.startsWith("{")) {
                    try {
                        const value = jsonToData(JSON.parse(rawValue))

                        result.push(value)
                    } catch (e) {
                        // TODO: dispaly error in view
                        return undefined
                    }
                } else {
                    try {
                        const value = decodeUplcData(rawValue)

                        result.push(value)
                    } catch (e) {
                        // TODO: display error in view
                        return undefined
                    }
                }
            }
        }

        if (args.requiresScriptContext) {
            const rawValue = this.#scriptContext

            if (!rawValue || rawValue == "") {
                // TODO: display error in view
                return undefined
            }

            if (rawValue.startsWith("{")) {
                try {
                    const value = jsonToData(JSON.parse(rawValue))

                    result.push(value)
                } catch (e) {
                    // TODO: dispaly error in view
                    return undefined
                }
            } else {
                try {
                    const value = decodeUplcData(rawValue)

                    result.push(value)
                } catch (e) {
                    // TODO: display error in view
                    return undefined
                }
            }
        }

        return result
    }

    private resetArgs() {
        this.#argValues = {}
        this.#scriptContext = ""
        this.#currentScript = ""
    }

    setArgNames(
        args: { name: string; type: string }[],
        requiresScriptContext: boolean,
        requiresCurrentScript: boolean
    ) {
        this.resetArgs()

        const nonIgnoredArgs = args.filter((a) => a.name != "_")

        this.postEntryPointViewContext({
            kind: "EntryPointViewContext",
            uri: this.#fileName,
            name: this.#entryPoint ?? "",
            arguments: nonIgnoredArgs,
            needsScriptContext: requiresScriptContext,
            needsCurrentValidator: requiresCurrentScript
        })
    }

    private postEntryPointViewContext(context: EntryPointViewContext) {
        this.#view?.webview?.postMessage(context)
    }

    setValidatorName(name: string) {
        if (this.#view) {
            this.#view.webview.postMessage({
                command: "setValidator",
                validator: name
            })
        }
    }

    private html(): string {
        return `<!DOCTYPE html>
<html lang="en">
<body>
<style>
    :root {
        color-scheme: light dark;
    }

    label {
        color: inherit;
        background-color: inherit;
    }

    html, body {
        height: 100%;
        background-color: transparent;
        color: var(--vscode-foreground);
    }

    a {
        color: var(--vscode-textLink-foreground);
        text-decoration: none;
    }
    
    a:hover {
        color: var(--vscode-textLink-activeForeground);
        text-decoration: underline;
    }

    input, select, textarea {
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: var(--vscode-input-border);
        border-radius: 2px;
        padding: 6px 8px;
        outline: none;
        width: 100%;
    }

    input::placeholder, textarea::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }

    input:focus, select:focus, textarea:focus {
        background: var(--vscode-inputOption-activeBackground);
        border: var(--vscode-inputOption-activeBorder);
        color: var(--vscode-inputOption-activeForeground);
    }

    button {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: 0;
        border-radius: 4px;
        padding: 6px 12px;
        cursor: pointer;
    }

    button:hover {
        background: var(--vscode-button-hoverBackground);
    }

    button.secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }

    code {
        font-family: monospace;
        background: transparent;
        color: inherit;
        font-size: 0.9em;
    }

    .section {
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-editorWidget-border, transparent);
        padding: 12px;
        border-radius: 6px;
    }
    .muted {
        color: var(--vscode-descriptionForeground);
    }

    .form {
        display: none;
        flex-direction: column;
        gap: 10px;
    }

    html[data-mode="no-entry-points"] .form {
        display: none;
    }

    #no-entry-points-message {
        display: none;
    }

    html[data-mode="no-entry-points"] #no-entry-points-message {
        display: unset;
    }

    #error-message {
        display: none;
        color: #ff0000;
    }

    #error-message p {
        color: #ff0000;
    }

    html[data-mode="error"] #error-message {
        display: unset;
        color: #ff0000;
    }

    html[data-mode="has-entry-points"] .form {
        display: flex;
    }

    #loading-message {
        display: none;
    }

    html:not([data-mode]) #loading-message {
        display: unset;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    #ScriptContext {
        display: none;
    }

    #ScriptContext[data-required="true"] {
        display: block !important;
    }

    #CurrentScript {
        display: none;
    }

    #CurrentScript[data-required="true"] {
        display: block !important;
    }


</style>

<div class="form">
    <div class="field">
        <label>Entry point of <code id="fileName1"></code></label>
        <select id="entryPoint"></select>
    </div>

    <div id="args">
    </div>

    <div id="ScriptContext">
        <label>ScriptContext</label>
        <textarea id="scriptContextInput"></textarea>
    </div>

    <div id="CurrentScript">
        <label>Current script</label>
        <select id="currentScriptSelect"></select>
    </div>
</div>

<div id="loading-message">
    <p>Loading...</p>
</div>

<div id="no-entry-points-message">
    <p>No entry points found in <code id="fileName2"></code></p>
</div>

<div id="error-message">
</div>

<script>
    const vscode = acquireVsCodeApi()

    document.getElementById("loading-message").innerHTML = "still works"

    //const log = (m) => {
    //    vscode.postMessage({
    //        command: "log",
    //        message: m
    //    })
    //}
//
    //setTimeout(() => {
    //    log("test")
    //}, 2000)
//
    //const setValidator = (m) => {
    //    const e = document.getElementById('validator')
    //    e.value = m.validator
    //}
//
    //const setFileName = (m) => {
    //    document.getElementById("fileName1").innerHTML = m.fileName
    //    document.getElementById("fileName2").innerHTML = m.fileName
    //}
//
    //const clearChildren = (e) => {
    //    while (e.firstChild) {
    //        const child = e.firstChild
    //        e.removeChild(child)
    //    }
    //}
//
    //const onChangeArgInput = (event) => {
    //    const target = event.target
    //    const value = target.value
//
    //    if (target.id.startsWith("arg-")) {
    //        const argName = target.id.slice(("arg-").length)
//
    //        vscode.postMessage({
    //            command: 'setArgValue',
    //            name: argName,
    //            value
    //        })
    //    }
    //}
//
    //const clearArgs = () => {
    //    const e = document.getElementById("args")
//
    //    while (e.firstChild) {
    //        const child = e.firstChild
//
    //        // if the child is an input or select, remove its event listener
    //        if (child.tagName == "input") {
    //            child.removeEventListener("input", onChangeArgInput)
    //        }
//
    //        e.removeChild(child)
    //    }
    //}
//
    //const sendMessage = () => {
    //    vscode.postMessage({
    //        command: 'run',
    //        entryPoint: document.getElementById('entryPoint').value,
    //        validator: document.getElementById('validator').value,
    //    })
    //}
//
    //const setError = (m) => {
    //    document.documentElement.setAttribute("data-mode", "error")
    //    document.getElementById("error-message").innerHTML = "<p>" + m.error + "</p>"
    //}
//
    //const setEntryPoints = (m) => {
    //    document.getElementById("ScriptContext").removeAttribute("data-required")
//
    //    const sel = document.getElementById('entryPoint')
    //    const prevValue = sel.value
    //    
    //    clearChildren(sel)
    //    clearArgs()
//
    //    const newEntryPoints = m["entryPoints"]
//
    //    if (newEntryPoints.length == 0) {
    //        document.documentElement.setAttribute("data-mode", "no-entry-points")
    //    
    //        vscode.postMessage({
    //            command: "entryPoint",
    //            entryPoint: undefined
    //        })
    //    } else {
    //        document.documentElement.setAttribute("data-mode", "has-entry-points")
//
    //        newEntryPoints.forEach((f) => {
    //            const opt = document.createElement('option')
    //            opt.value = f
    //            opt.textContent = f
    //            sel.appendChild(opt)
    //        })
//
    //        sel.value = newEntryPoints[0]
    //        
    //        setEntryPoint(sel.value)
    //    }
    //}
//
    //const setEntryPoint = (entryPoint) => {
    //    vscode.postMessage({
    //        command: "setEntryPoint",
    //        entryPoint: entryPoint
    //    })
    //}
//
    //const setCurrentScript = (currentScript) => {
    //    vscode.postMessage({
    //        command: "setCurrentScript",
    //        currentScript
    //    })
    //}
//
    //const setScriptContextVisible = (m) => {
    //    try {
    //        const e = document.getElementById("ScriptContext")
//
    //        log("setting script context to", m.requiresScriptContext.toString())
//
    //        if (e) {
    //            if (m.requiresScriptContext) {
    //                e.setAttribute("data-required", "true")
    //            } else {
    //                e.removeAttribute("data-required")
    //            }
    //        }
    //    } catch(_e) {
    //        log("setting script context to", m.requiresScriptContext.toString())
    //    }
    //}
//
    //const setCurrentScriptOptions = (m) => {
    //    return
    //    log("setting script options")
    //    const e = document.getElementById("CurrentScript")
//
    //    if (m.requiresCurrentScript) {
    //        const sel = document.getElementById("currentScriptSelect")
    //        const prevValue = sel.value
    //    
    //        clearChildren(sel)
//
    //        const scriptNames = m["scriptNames"]
//
    //        scriptNames.forEach((n) => {
    //            const opt = document.createElement('option')
    //            opt.value = n
    //            opt.textContent = n
    //            sel.appendChild(opt)
    //        })
//
    //        if (scriptNames.length > 0) {
    //            sel.value = scriptNames[0]
    //            setCurrentScript(scriptNames[0])
    //        }
    //        
    //        e.setAttribute("data-required", "true")
    //    } else {
    //        e.removedAttribute("data-required")
    //    }
    //}
//
    //const setArgNames = (m) => {
    //    clearArgs()
//
    //    const container = document.getElementById("args")
//
    //    for (let arg of m.argNames) {
    //        const id = "arg-" + arg
//
    //        const label = document.createElement("label")
    //        label.setAttribute("for", id)
    //        label.innerHTML = "<code>" + arg + "</code>"
//
    //        container.appendChild(label)
//
    //        const input = document.createElement("input")
    //        input.type = "text"
    //        input.id = id
    //        input.addEventListener("input", onChangeArgInput)
//
    //        container.appendChild(input)
    //    }
    //}
//
//
    //const clearTooManyChildren = (e) => {
    //    while (e.lastChild && e.children.length > 5) {
    //        e.removeChild(e.lastChild)
    //    }
    //}
//
    //const prependChild = (p, e) => {
    //    if (p.children.length == 0) {
    //        p.appendChild(e)
    //    } else {
    //        p.insertBefore(e, p.children[0])
    //    }
    //}
//
//
    //document.getElementById("entryPoint").addEventListener("change", (event) => {
    //    setEntryPoint(event.target.value)
    //})
//
    //document.getElementById("currentScriptSelect").addEventListener("change", (event) => {
    //    setCurrentScript(event.target.value)
    //})
//
    //const setScriptContext = (ctx) => {
    //    vscode.postMessage({
    //        command: "setScriptContext",
    //        ctx: ctx
    //    })
    //}
//
    //const reset = () => {
    //    document.documentElement.removeAttribute("data-mode")
    //}
    //    
    //document.getElementById("scriptContextInput").addEventListener("change", (event) => {
    //    setScriptContext(event.target.value)
    //})
//
    //// how to send messages?
    window.addEventListener("message", (event) => {
        try {
            const m = event.data

            switch (m.command) {
                case "setValidator": {
                    setValidator(m)
                    break
                }
                case "setEntryPoints": {
                    setEntryPoints(m)
                    setFileName(m)
                    break
                }
                case "setArgNames": {
                    setArgNames(m)
                    setScriptContextVisible(m)
                    //setCurrentScriptOptions(m)
                    break
                }
                case "setError": {
                    setError(m)
                    break
                }
                case "reset"" {
                    reset()
                    break
                }
            }
        } catch(e) {
            log(e.message)
        }
    })
</script>
</body>
</html>`
    }

    private async run(file: string, input: string) {
        return
        //log("Running webview logic (compilation shouldn't happen as part of webview though)...")
        //
        //let doc: TextDocument | undefined
        //const open = workspace.textDocuments.find((d) => d.fileName === file)
        //if (open) {
        //    doc = open
        //} else {
        //    try {
        //        doc = await workspace.openTextDocument(file)
        //    } catch {
        //        const editor = window.activeTextEditor
        //        doc = editor?.document
        //    }
        //}
        //if (!doc) {
        //    return
        //}
        //if (!isHeliosExt(doc.fileName)) {
        //    log(
        //        "Selected file is not a Helios script"
        //    )
        //    return
        //}
        //
        //const repo = this.#cache.loadCachedRepository(doc.fileName)
        //if (!repo) {
        //    log(
        //        "No package.json with helios dependency found"
        //    )
        //    return
        //}
        //
        //const requireFromRepo = createRequire(repo.path)
        //
        //let Program: any
        //let makeUplcDataValue: any
        //let decodeUplcData: any
        //let hexToBytes: any
        //let makeIntData: any
        //let makeByteArrayData: any
        //let makeListData: any
        //let makeMapData: any
        //let makeConstrData: any
        //let boolToUplcData: any
        //let stringToUplcData: any
        //
        //try {
        //    // we must use contract-utils to build, because of builtin Scripts:: module (scripts can be imported anywhere)
        //    const cPath = requireFromRepo.resolve("@helios-lang/compiler")
        //    ;({ Program } = await import(cPath))
        //    ;({
        //        makeUplcDataValue,
        //        decodeUplcData,
        //        makeIntData,
        //        makeByteArrayData,
        //        makeListData,
        //        makeMapData,
        //        makeConstrData,
        //        boolToUplcData,
        //        stringToUplcData
        //    } = await import(requireFromRepo.resolve("@helios-lang/uplc")))
        //    ;({ hexToBytes } = await import(
        //        requireFromRepo.resolve("@helios-lang/codec-utils")
        //    ))
        //} catch (e: any) {
        //    log("Failed to load @helios-lang/compiler from workspace")
        //    return
        //}
        //
        //// this doesn't work?
        //const program = new Program(doc.getText())
        //const uplc = program.compile(false)
        //
        //const args = [] as any[]
        //if (input.trim().length > 0) {
        //    try {
        //        let data: any
        //        if (/^[0-9a-fA-F]+$/.test(input.trim())) {
        //            data = decodeUplcData(hexToBytes(input.trim()))
        //        } else {
        //            data = jsonToData(JSON.parse(input), {
        //                makeIntData,
        //                makeByteArrayData,
        //                makeListData,
        //                makeMapData,
        //                makeConstrData,
        //                boolToUplcData,
        //                stringToUplcData
        //            })
        //        }
        //        args.push(makeUplcDataValue(data))
        //    } catch (e: any) {
        //        log("Input parse error: " + e.message)
        //        return
        //    }
        //}
        //
        //try {
        //    const res = uplc.eval(args)
        //    res.logs.forEach((l: string) => log(l))
        //    if (res.result.left) {
        //        log("Error: " + res.result.left.error)
        //    } else {
        //        if (typeof res.result.right === "string") {
        //            log(res.result.right)
        //        } else if (res.result.right.kind == "data") {
        //            log(res.result.right.value.toString())
        //        } else {
        //            log(res.result.right.toString())
        //        }
        //    }
        //} catch (e: any) {
        //    log("Runtime error: " + e.message)
        //}
    }
}

function jsonToData(obj: any): UplcData {
    if (obj === null) {
        throw new Error("null not supported")
    }
    if (typeof obj === "number") {
        return makeIntData(BigInt(Math.trunc(obj)))
    }
    if (typeof obj === "string") {
        return makeByteArrayData(encodeUtf8(obj))
    }
    if (typeof obj === "boolean") {
        return boolToUplcData(obj)
    }
    if (Array.isArray(obj)) {
        return makeListData(obj.map((x) => jsonToData(x)))
    }
    if (typeof obj === "object") {
        if ("int" in obj) {
            return makeIntData(BigInt(obj.int))
        }
        if ("bytes" in obj) {
            return makeByteArrayData({ bytes: hexToBytes(obj.bytes) })
        }
        if ("list" in obj) {
            return makeListData(obj.list.map((x: any) => jsonToData(x)))
        }
        if ("map" in obj) {
            return makeMapData(
                obj.map.map((p: any) => [jsonToData(p.k), jsonToData(p.v)])
            )
        }
        if ("constructor" in obj && "fields" in obj) {
            return makeConstrData(
                obj.constructor,
                obj.fields.map((x: any) => jsonToData(x))
            )
        }
    }
    throw new Error("invalid JSON")
}

function genDummyHashes(validators: string[]): Record<string, string> {
    let result: Record<string, string> = {}

    for (let name of validators) {
        result[name] = bytesToHex(blake2b(encodeUtf8(name), 28))
    }

    return result
}

/**
 *
 * @param errors
 */
function collectErrorFiles(errors: ErrorCollector | undefined): string[] {
    if (!errors) {
        return []
    }

    const s: Set<string> = new Set()

    for (let e of errors.errors) {
        if (!e.site.file.startsWith("::")) {
            s.add(e.site.file)
        }
    }

    return Array.from(s).map((f) => f)
}

function formatErrorFiles(files: string[]): string {
    const html = files.map((f) => `<code>${f}</code>`)

    if (html.length == 1) {
        return html[0]
    } else {
        return (
            html.slice(0, html.length - 1).join(", ") +
            " and " +
            html[html.length - 1]
        )
    }
}

type FocusOrOpenTextEditorOptions = {
    line: number // 1-based
    column?: number // 1-based, defaults to 1
    reveal?: TextEditorRevealType // defaults to TextEditorRevealType.InCenterIfOutsideViewport
    docShowOpts?: TextDocumentShowOptions
}

/**
 * Focus the editor showing `uri` if it's already open; otherwise open it.
 * @param uri
 * The file URI to focus/open.
 *
 * @param options
 */
async function focusOrOpenTextEditorAtPos(
    uri: Uri,
    options: FocusOrOpenTextEditorOptions
): Promise<TextEditor> {
    const docShowOpts = options.docShowOpts ?? {}

    const editor = await focusOrOpenTextEditor(uri, docShowOpts)
    const doc = editor.document

    // Convert to 0-based and clamp
    const l0 = Math.max(0, Math.min(doc.lineCount - 1, (options.line | 0) - 1))
    const maxCol = doc.lineAt(l0).range.end.character
    const c0 = Math.max(0, Math.min(maxCol, (options.column ?? 1) - 1))
    const pos = new Position(l0, c0)
    const range = new Range(pos, pos)

    const reveal =
        options.reveal ?? TextEditorRevealType.InCenterIfOutsideViewport
    editor.revealRange(range, reveal)

    return editor
}

/**
 * Focus the editor showing `uri` if it's already open; otherwise open it.
 * @param uri
 * The file URI to focus/open.
 *
 * @param options
 * Optional VS Code show options (selection, preview, preserveFocus, etc.)
 */
async function focusOrOpenTextEditor(
    uri: Uri,
    options: TextDocumentShowOptions = {}
): Promise<TextEditor> {
    // Look for an already visible editor with this document
    const match = window.visibleTextEditors.find(
        (editor) => editor.document.uri.toString(true) === uri.toString(true)
    )

    if (match) {
        // Reveal in the same group it’s already in
        return window.showTextDocument(match.document, {
            viewColumn: match.viewColumn,
            preserveFocus: false,
            ...options
        })
    }

    // Not visible: if the doc is already open but hidden, this will reuse it;
    // otherwise it loads from disk and opens it.
    const doc = await workspace.openTextDocument(uri)

    return window.showTextDocument(doc, {
        preserveFocus: false,
        preview: false,
        ...options
    })
}
