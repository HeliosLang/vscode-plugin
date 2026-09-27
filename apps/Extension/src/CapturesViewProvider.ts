import { captureHtml } from "./captureView"
import {
    commands,
    window,
    workspace,
    type ExtensionContext,
    type WebviewView,
    type WebviewViewProvider
} from "vscode"
import { makeHeliosSource } from "@helios-lang/compiler-utils"
import { CaptureFeed, type CaptureRow } from "./captureFeed"
import { readCaptureProfiles } from "./captureConfig"
import { ASTProvider } from "./ASTProvider"
import { ArgsViewProvider } from "./ArgsViewProvider"

export class CapturesViewProvider implements WebviewViewProvider {
    private view?: WebviewView
    private feed = new CaptureFeed()
    private timer?: ReturnType<typeof setTimeout>
    private controller?: AbortController
    private busy = false
    private selecting = false
    private refreshPending = false
    private credentialsError?: string
    private selectionError?: string
    private profileCount = 0
    constructor(
        private readonly ast: ASTProvider,
        private readonly args: ArgsViewProvider,
        context: ExtensionContext
    ) {
        context.subscriptions.push(
            window.registerWebviewViewProvider(
                "helios.capturedFailedTxs",
                this
            ),
            commands.registerCommand("helios.refreshCapturedTxs", () =>
                this.poll(true)
            ),
            commands.registerCommand("helios.loadCapturedTx", (id: string) =>
                this.select(id)
            ),
            { dispose: () => this.stop() }
        )
    }
    resolveWebviewView(view: WebviewView) {
        this.view = view
        view.webview.options = { enableScripts: true, localResourceRoots: [] }
        view.webview.html = captureHtml()
        view.webview.onDidReceiveMessage((message) => {
            if (message?.kind === "ready") this.poll(true)
            if (message?.kind === "select" && typeof message.id === "string")
                this.select(message.id)
        })
        view.onDidChangeVisibility(() => {
            if (view.visible) this.poll(true)
            else this.stop()
        })
        view.onDidDispose(() => {
            this.stop()
            this.view = undefined
        })
    }
    private stop() {
        clearTimeout(this.timer)
        this.controller?.abort()
    }
    private render() {
        this.view?.webview.postMessage({
            kind: "captures",
            rows: this.feed.rows,
            busy: this.busy || this.selecting,
            errors: [
                ...(this.selectionError ? [this.selectionError] : []),
                ...(this.credentialsError ? [this.credentialsError] : []),
                ...this.feed.errors
            ],
            empty: this.profileCount
                ? "No failed transactions captured."
                : "No Helios Debugger API keys configured yet"
        })
    }
    private async poll(force = false) {
        if (!this.view?.visible) return
        if (this.busy) {
            this.refreshPending ||= force
            return
        }
        clearTimeout(this.timer)
        this.busy = true
        const controller = new AbortController()
        this.controller = controller
        this.render()
        try {
            const profiles = await readCaptureProfiles()
            this.profileCount = profiles.length
            this.credentialsError = undefined
            this.feed.configure(profiles)
            if (!controller.signal.aborted)
                await this.feed.poll(controller.signal, force)
        } catch (error) {
            this.credentialsError = (error as Error).message
        } finally {
            this.busy = false
            this.render()
            if (this.view?.visible) {
                const delay = this.refreshPending ? 0 : 5000
                const pending = this.refreshPending
                this.refreshPending = false
                this.timer = setTimeout(() => this.poll(pending), delay)
            }
        }
    }
    private async select(id: string) {
        if (this.selecting) return
        const row = this.feed.rows.find((r) => r.id === id)
        if (!row) return
        this.selecting = true
        this.selectionError = undefined
        this.render()
        try {
            await this.importRow(row)
            return { success: true }
        } catch (error) {
            this.selectionError = (error as Error).message
            return { success: false, error: this.selectionError }
        } finally {
            this.selecting = false
            this.render()
        }
    }
    private async importRow(row: CaptureRow) {
        const capture = this.feed.capture(row)
        if (!capture || row.evaluationIndex < 0)
            throw new Error(
                row.error ?? "Capture is unavailable. Refresh and try again."
            )
        if (row.validator === "Unknown validator")
            throw new Error(
                "Capture has missing or ambiguous validator source metadata."
            )
        const uris = await workspace.findFiles(
            "**/*.{hl,helios}",
            "**/{node_modules,.git}/**"
        )
        const docs = await Promise.all(
            uris.map((uri) => workspace.openTextDocument(uri))
        )
        const matches = docs.filter((doc) => {
            try {
                const s = makeHeliosSource(doc.getText())
                return s.moduleName === row.validator && s.purpose !== "module"
            } catch {
                return false
            }
        })
        if (!matches.length)
            throw new Error(
                `Validator "${row.validator}" can't be found in the local workspace. Open the folder containing its Helios source.`
            )
        const selected =
            matches.length === 1
                ? matches[0]
                : (
                      await window.showQuickPick(
                          matches.map((doc) => ({
                              label: workspace.asRelativePath(doc.uri),
                              description: doc.uri.fsPath,
                              doc
                          })),
                          { placeHolder: `Select ${row.validator}` }
                      )
                  )?.doc
        if (!selected) return
        const program = await this.ast.compileDocument(selected, docs)
        if (program.errors.errors.length)
            throw new Error(
                `Cannot import capture: '${row.validator}' has compilation errors. Fix them first.`
            )
        const capturedSources = Object.values(capture.sources ?? {})
        const localSources = [
            program.entryPoint.mainModule.sourceCode.content,
            ...program.entryPoint.mainImportedModules.map(
                (m) => m.sourceCode.content
            )
        ]
        const warning = !capturedSources.length
            ? "Captured source metadata is unavailable; source compatibility cannot be checked."
            : localSources.some((source) => !capturedSources.includes(source))
              ? "Workspace sources differ from this capture. Run will debug the current local source."
              : undefined
        await this.args.importCapture(
            program,
            selected.uri,
            capture,
            row.evaluationIndex
        )
        await window.showTextDocument(selected, { preview: false })
        await commands.executeCommand("setContext", "heliosDebugActive", true)
        await commands.executeCommand("helios.entryPointAndArguments.focus")
        if (warning) window.showWarningMessage(warning)
    }
}
