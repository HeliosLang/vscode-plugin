import {
    WebviewViewProvider,
    WebviewView,
    WebviewViewResolveContext,
    ExtensionContext,
    CancellationToken,
    commands,
    window,
    debug
} from "vscode"

import { createRequire } from "module"

import { Cache } from "./cache"
import { isHeliosExt } from "./repository"

export class RunViewProvider implements WebviewViewProvider {
    public static readonly viewType = "helios.runView"

    #context: ExtensionContext
    #cache: Cache
    #view: WebviewView | undefined

    constructor(context: ExtensionContext, cache: Cache) {
        this.#context = context
        this.#cache = cache
    }

    resolveWebviewView(
        webviewView: WebviewView,
        _context: WebviewViewResolveContext<any>,
        _token: CancellationToken
    ) {
        this.#view = webviewView

        webviewView.webview.options = { enableScripts: true }
        webviewView.webview.html = this.html()
        webviewView.webview.onDidReceiveMessage(async msg => {
            if (msg.command == "run") {
                await this.run(msg.validator, msg.input)
            }
        })
    }

    reveal() {
        if (this.#view) {
            this.#view.show(true)
        } else {
            commands.executeCommand("helios.showRunView")
        }
    }

    setValidatorName(name: string) {
        if (this.#view) {
            this.#view.webview.postMessage({ command: "setValidator", validator: name })
        }
    }

    private html(): string {
        const nonce = Date.now().toString()
        return `<!DOCTYPE html>
<html lang="en">
<body>
    <style>
    body { font-family: sans-serif; padding: 10px; }
    textarea { width: 100%; height: 60px; }
    input { width: 100%; }
    </style>
    <label>Validator name:</label><br/>
    <input id="validator" /><br/>
    <label>Input (JSON or hex CBOR):</label><br/>
    <textarea id="input"></textarea><br/>
    <button id="run">Run</button>
    <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('run').addEventListener('click', () => {
        vscode.postMessage({
            command: 'run',
            validator: document.getElementById('validator').value,
            input: document.getElementById('input').value
        });
    });
    window.addEventListener('message', event => {
        const m = event.data;
        if (m.command === 'setValidator') {
            document.getElementById('validator').value = m.validator;
        }
    });
    </script>
</body>
</html>`
    }

    private async run(_validator: string, input: string) {
        const editor = window.activeTextEditor
        if (!editor) {
            return
        }
        const doc = editor.document
        if (!isHeliosExt(doc.fileName)) {
            debug.activeDebugConsole.appendLine("Active file is not a Helios script")
            return
        }

        const repo = this.#cache.loadCachedRepository(doc.fileName)
        if (!repo) {
            debug.activeDebugConsole.appendLine("No package.json with helios dependency found")
            return
        }

        const requireFromRepo = createRequire(repo.path)

        let Program: any
        let makeUplcDataValue: any
        let decodeUplcData: any
        let hexToBytes: any
        let makeIntData: any
        let makeByteArrayData: any
        let makeListData: any
        let makeMapData: any
        let makeConstrData: any
        let boolToUplcData: any
        let stringToUplcData: any

        try {
            const cPath = requireFromRepo.resolve("@helios-lang/compiler")
            ;({ Program } = await import(cPath))
            ;({ makeUplcDataValue, decodeUplcData, makeIntData, makeByteArrayData, makeListData, makeMapData, makeConstrData, boolToUplcData, stringToUplcData } = await import(requireFromRepo.resolve("@helios-lang/uplc")))
            ;({ hexToBytes } = await import(requireFromRepo.resolve("@helios-lang/codec-utils")))
        } catch(e: any) {
            debug.activeDebugConsole.appendLine("Failed to load @helios-lang/compiler from workspace")
            return
        }

        const program = new Program(doc.getText())
        const uplc = program.compile(false)

        const args = [] as any[]
        if (input.trim().length > 0) {
            try {
                let data: any
                if (/^[0-9a-fA-F]+$/.test(input.trim())) {
                    data = decodeUplcData(hexToBytes(input.trim()))
                } else {
                    data = this.jsonToData(JSON.parse(input), { makeIntData, makeByteArrayData, makeListData, makeMapData, makeConstrData, boolToUplcData, stringToUplcData })
                }
                args.push(makeUplcDataValue(data))
            } catch(e: any) {
                debug.activeDebugConsole.appendLine("Input parse error: " + e.message)
                return
            }
        }

        try {
            const res = uplc.eval(args)
            res.logs.forEach((l: string) => debug.activeDebugConsole.appendLine(l))
            if (res.result.left) {
                debug.activeDebugConsole.appendLine("Error: " + res.result.left.error)
            } else {
                if (typeof res.result.right === "string") {
                    debug.activeDebugConsole.appendLine(res.result.right)
                } else if (res.result.right.kind == "data") {
                    debug.activeDebugConsole.appendLine(res.result.right.value.toString())
                } else {
                    debug.activeDebugConsole.appendLine(res.result.right.toString())
                }
            }
        } catch(e: any) {
            debug.activeDebugConsole.appendLine("Runtime error: " + e.message)
        }
    }

    private jsonToData(obj: any, fns: any): any {
        const { makeIntData, makeByteArrayData, makeListData, makeMapData, makeConstrData, boolToUplcData, stringToUplcData } = fns
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
            return makeListData(obj.map(x => this.jsonToData(x, fns)))
        }
        if (typeof obj === "object") {
            if ("int" in obj) {
                return makeIntData(BigInt(obj.int))
            }
            if ("bytes" in obj) {
                return makeByteArrayData({ bytes: fns.hexToBytes(obj.bytes) })
            }
            if ("list" in obj) {
                return makeListData(obj.list.map((x: any) => this.jsonToData(x, fns)))
            }
            if ("map" in obj) {
                return makeMapData(obj.map.map((p: any) => [this.jsonToData(p.k, fns), this.jsonToData(p.v, fns)]))
            }
            if ("constructor" in obj && "fields" in obj) {
                return makeConstrData(obj.constructor, obj.fields.map((x: any) => this.jsonToData(x, fns)))
            }
        }
        throw new Error("invalid JSON")
    }
}
