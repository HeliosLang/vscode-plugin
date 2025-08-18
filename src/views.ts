import {
    WebviewViewProvider,
    WebviewView,
    WebviewViewResolveContext,
    ExtensionContext,
    CancellationToken,
    commands,
    window,
    debug,
    workspace,
    TextDocument
} from "vscode"
import { createRequire } from "module"
import { bytesToHex, encodeUtf8 } from "@helios-lang/codec-utils"
import { Program } from "@helios-lang/compiler"
import { blake2b } from "@helios-lang/crypto"
import { Cache } from "./cache"
import { log } from "./log"
import { isHeliosExt } from "./repository"

const vscodeStyleSheet = `` 

/**
 * Display
 */
export class EntryPointAndArgumentsViewProvider implements WebviewViewProvider {
    #view: WebviewView | undefined
    #activeAST: Program | undefined
    #entryPoint: string | undefined
    #argValues: Record<string, string>
    #scriptContext: string

    constructor() {
        this.#view = undefined
        this.#activeAST = undefined
        this.#entryPoint = undefined
        this.#argValues = {}
        this.#scriptContext = ""
    }

    resolveWebviewView(
        view: WebviewView,
        _context: WebviewViewResolveContext<any>,
        _token: CancellationToken
    ) {
        this.#view = view

        this.#view.webview.options = { 
            enableScripts: true
        }

        this.#view.webview.html = this.html()

        this.#view.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case "run":
                    await this.run(msg.file, msg.input)
                    break
                case "setEntryPoint":
                    this.setEntryPoint(msg.entryPoint)
                    break
                case "setArgValue":
                    this.setArgValue(msg.name, msg.value)
                    break
                case "setScriptContext":
                    this.setScriptContext(msg.ctx)
                    break
            }
        })
    }

    setArgValue(name: string, value: string) {
        console.log(`set arg ${name} to "${value}"`)
        this.#argValues[name] = value
    }

    setScriptContext(ctx: string) {
        console.log(`set scriptcontext`)
        this.#scriptContext = ctx
    }

    setAST(fileName: string, ast: Program | undefined) {
        
        this.#activeAST = ast

        // TODO: send a message to update the html
        
        // send the list of entrypoints
        let entryPoints: string[] = []
        
        if (ast) {
            const key = ast.entryPoint.mainModule.name.value

            if (key in ast.userFunctions) {
                entryPoints = Object.keys(ast.userFunctions[key])
            }

            if (ast.entryPoint.mainFunc) {
                entryPoints.push("main")
            }
        }

        console.log(`setting fileName: ${fileName}`)

        if (this.#view) {
            this.#view.webview.postMessage({ command: "setEntryPoints", entryPoints, fileName})
        } else {
            this.log("view not available")
        }
    }

    // this sets the arguments
    setEntryPoint(entryPoint: string) {
        this.#entryPoint = entryPoint

        // TODO: set the args

        console.log(`entryPoint set to ${entryPoint}`)

        if (this.#activeAST) {
            if (entryPoint == "main" && this.#activeAST.entryPoint.mainFunc) {
                // main function that don't actually depend on the ScriptContext are rare and shouldn't exist
                this.setArgNames(
                    this.#activeAST.entryPoint.mainFunc.argNames,
                    true
                )
            } else {
                const key = this.#activeAST.entryPoint.mainModule.name.value

                if (key in this.#activeAST.userFunctions) {
                    const userFn = this.#activeAST.userFunctions[key][entryPoint]

                    // assume that by default the userFunc depends on the script context
                    let requiresScriptContext = true

                    if (this.#activeAST.props.validatorTypes) {
                        console.log(`compiling ${entryPoint} to check if ScriptContext is required`)

                        const validatorTypes = this.#activeAST.props.validatorTypes

                        const { requiresScriptContext: rsc } = userFn.toIR({
                            hashDependencies: genDummyHashes(Object.keys(validatorTypes)),
                            validatorTypes: validatorTypes,
                            optimize: false
                        })

                        console.log(`  is required: ${rsc}`)

                        requiresScriptContext = rsc
                    } else {
                        console.log("validatorTypes not set?")
                    }
                    
                    try {
                        const constStmnt = userFn.mainConst

                        this.setArgNames([], requiresScriptContext)
                    } catch(_e) {
                        const fnStmnt = userFn.mainFunc

                        this.setArgNames(fnStmnt.argNames, requiresScriptContext)
                    }
                } 
            }
        }
    }

    /**
     * For debugging
     * @param msg 
     */
    log(msg: string) {
        if (this.#view) {
            this.#view.webview.postMessage({ command: "logEvent", msg })
        }
    }

    setArgNames(names: string[], requiresScriptContext: boolean) {
        this.#argValues = {}
        this.#scriptContext = ""

        const nonIgnoredNames = names.filter(n => n != "_")

        if (this.#view) {
            console.log("setting arg names to: ", nonIgnoredNames, requiresScriptContext)
            this.#view.webview.postMessage({
                command: "setArgNames",
                argNames: nonIgnoredNames,
                requiresScriptContext
            })
        }
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
        const nonce = Date.now().toString()
        return `<!DOCTYPE html>
<html lang="en">
<body>
<style>
    :root {
        color-scheme: light dark;
    }

    *, label {
        background-color: transparent;
        color: var(--vscode-foreground);
    }

    html, body {
        height: 100%;
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
        color: var(--vscode-foreground);
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
        display: flex;
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

    .field {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    #ScriptContext[data-required="true"] {
        display: block !important;
    }

    #ScriptContext {
        display: none;
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

    <div id="log">
        <label>Log</label>
        <textarea id="logEvent"></textarea><br/>
    </div>
</div>

<div id="no-entry-points-message">
    <p>No entry points found in <code id="fileName2"></code></p>
</div>

<script nonce="${nonce}">
    const vscode = acquireVsCodeApi()

    const setValidator = (m) => {
        const e = document.getElementById('validator')
        e.value = m.validator
    }

    const setFileName = (m) => {
        document.getElementById("fileName1").innerHTML = m.fileName
        document.getElementById("fileName2").innerHTML = m.fileName
    }

    const clearChildren = (e) => {
        while (e.firstChild) {
            const child = e.firstChild
            e.removeChild(child)
        }
    }

    const onChangeArgInput = (event) => {
        const target = event.target
        const value = target.value

        if (target.id.startsWith("arg-")) {
            const argName = target.id.slice(("arg-").length)

            vscode.postMessage({
                command: 'setArgValue',
                name: argName,
                value
            })
        }
    }

    const clearArgs = () => {
        const e = document.getElementById("args")

        while (e.firstChild) {
            const child = e.firstChild

            // if the child is an input or select, remove its event listener
            if (child.tagName == "input") {
                child.removeEventListener("input", onChangeArgInput)
            }

            e.removeChild(child)
        }
    }

    const sendMessage = () => {
        vscode.postMessage({
            command: 'run',
            entryPoint: document.getElementById('entryPoint').value,
            validator: document.getElementById('validator').value,
        })
    }

    const setEntryPoints = (m) => {
        document.getElementById("ScriptContext").removeAttribute("data-required")

        const sel = document.getElementById('entryPoint')
        const prevValue = sel.value
        
        clearChildren(sel)
        clearArgs()

        const newEntryPoints = m["entryPoints"]

        if (newEntryPoints.length == 0) {
            document.documentElement.setAttribute("data-mode", "no-entry-points")
        
            vscode.postMessage({
                command: "entryPoint",
                entryPoint: undefined
            })
        } else {
            document.documentElement.removeAttribute("data-mode")

            newEntryPoints.forEach((f) => {
                const opt = document.createElement('option')
                opt.value = f
                opt.textContent = f
                sel.appendChild(opt)
            })

            sel.value = newEntryPoints[0]
            
            setEntryPoint(sel.value)
        }
    }

    const setEntryPoint = (entryPoint) => {
        vscode.postMessage({
            command: "setEntryPoint",
            entryPoint: entryPoint
        })
    }

    const setScriptContextVisible = (m) => {
        try {
            const e = document.getElementById("ScriptContext")

            logEvent({msg: "setting script context to " + m.requiresScriptContext.toString()})

            //console.log("can we log here?", m, e) // no
            //
            if (e) {
                if (m.requiresScriptContext) {
                    e.setAttribute("data-required", "true")
                } else {
                    e.removeAttribute("data-required")
                }
            }
        } catch(_e) {
            logEvent({msg: "setting script context to " + m.requiresScriptContext.toString()})
        }
    }

    const setArgNames = (m) => {
        clearArgs()

        const container = document.getElementById("args")

        for (let arg of m.argNames) {
            const id = "arg-" + arg

            const label = document.createElement("label")
            label.setAttribute("for", id)
            label.innerHTML = "<code>" + arg + "</code>"

            container.appendChild(label)

            const input = document.createElement("input")
            input.type = "text"
            input.id = id
            input.addEventListener("input", onChangeArgInput)

            container.appendChild(input)
        }
    }


    const clearTooManyChildren = (e) => {
        while (e.lastChild && e.children.length > 5) {
            e.removeChild(e.lastChild)
        }
    }

    const prependChild = (p, e) => {
        if (p.children.length == 0) {
            p.appendChild(e)
        } else {
            p.insertBefore(e, p.children[0])
        }
    }

    const logEvent = (m) => {
        const e = document.getElementById("log")
        clearTooManyChildren(e)
        const entry = document.createElement("p")
        entry.innerHTML = m.msg
        prependChild(e, entry)
    }

    document.getElementById("entryPoint").addEventListener("change", (event) => {
        setEntryPoint(event.target.value)
    })

    const setScriptContext = (ctx) => {
        vscode.postMessage({
            command: "setScriptContext",
            ctx: ctx
        })
    }
        
    document.getElementById("scriptContextInput").addEventListener("change", (event) => {
        setScriptContext(event.target.value)
    })

    // how to send messages?
    window.addEventListener("message", (event) => {
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
                setScriptContextVisible(m)
                setArgNames(m)
                break
            }
            case "logEvent": {
                logEvent(m)
                break
            }
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

function jsonToData(obj: any, fns: any): any {
    const {
        makeIntData,
        makeByteArrayData,
        makeListData,
        makeMapData,
        makeConstrData,
        boolToUplcData,
        stringToUplcData
    } = fns
    if (obj === null) {
        throw new Error("null not supported")
    }
    if (typeof obj === "number") {
        return makeIntData(BigInt(Math.trunc(obj)))
    }
    if (typeof obj === "string") {
        return stringToUplcData(obj)
    }
    if (typeof obj === "boolean") {
        return boolToUplcData(obj)
    }
    if (Array.isArray(obj)) {
        return makeListData(obj.map((x) => jsonToData(x, fns)))
    }
    if (typeof obj === "object") {
        if ("int" in obj) {
            return makeIntData(BigInt(obj.int))
        }
        if ("bytes" in obj) {
            return makeByteArrayData({ bytes: fns.hexToBytes(obj.bytes) })
        }
        if ("list" in obj) {
            return makeListData(
                obj.list.map((x: any) => jsonToData(x, fns))
            )
        }
        if ("map" in obj) {
            return makeMapData(
                obj.map.map((p: any) => [
                    jsonToData(p.k, fns),
                    jsonToData(p.v, fns)
                ])
            )
        }
        if ("constructor" in obj && "fields" in obj) {
            return makeConstrData(
                obj.constructor,
                obj.fields.map((x: any) => jsonToData(x, fns))
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