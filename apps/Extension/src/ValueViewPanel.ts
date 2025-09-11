import { TypeSchema } from "@helios-lang/type-utils"
import {
    Store,
    TypeSchemasContext,
    ValuePanelContext,
    ValueStoreContext
} from "schemas"
import { ExtensionContext, Uri, ViewColumn, WebviewPanel, window } from "vscode"
import { ASTProvider, CompileActiveDocumentListener } from "./ASTProvider"
import { Program } from "@helios-lang/compiler"
import { collectValidators } from "./ast"

export class ValueViewPanel {
    private astProvider: ASTProvider
    readonly panel: WebviewPanel
    readonly typeName: string
    private valueName_: string
    private compileListener_: CompileActiveDocumentListener

    constructor(
        extensionContext: ExtensionContext,
        astProvider: ASTProvider,
        typeName: string,
        valueName: string
    ) {
        this.astProvider = astProvider

        const panelName = `helios-${typeName}-value`
        const panelTitle = valueName

        const panel = window.createWebviewPanel(
            panelName,
            panelTitle,
            ViewColumn.One,
            {
                enableScripts: true
            }
        )

        panel.iconPath = {
            light: Uri.joinPath(
                extensionContext.extensionUri,
                "variable-icon-light.png"
            ),
            dark: Uri.joinPath(
                extensionContext.extensionUri,
                "variable-icon-dark.png"
            )
        }

        this.panel = panel
        this.typeName = typeName
        this.valueName_ = valueName

        this.compileListener_ = (_program: Program | undefined) => {
            this.syncPanelContext()
        }

        this.astProvider.addCompileActiveDocumentListener(this.compileListener_)
    }

    get valueName(): string {
        return this.valueName_
    }

    changeName(newName: string) {
        if (newName == this.valueName_) {
            return
        }

        this.panel.title = newName
        this.valueName_ = newName

        this.syncPanelContext()
    }

    dispose() {
        this.astProvider.removeCompileActiveDocumentListener(
            this.compileListener_
        )
        this.panel.dispose()
    }

    init(schemas: Record<string, TypeSchema>, store: Store) {
        this.syncTypeSchemas(schemas)
        this.syncValueStore(store)
        this.syncPanelContext()
    }

    reveal() {
        this.panel.reveal()
    }

    syncTypeSchemas(schemas: Record<string, TypeSchema>) {
        this.panel.webview.postMessage({
            kind: "TypeSchemas",
            schemas
        } satisfies TypeSchemasContext)
    }

    syncValueStore(store: Store) {
        this.panel.webview.postMessage({
            kind: "ValueStore",
            store
        } satisfies ValueStoreContext)
    }

    private syncPanelContext() {
        const allValidators = this.astProvider.allValidators

        this.panel.webview.postMessage({
            kind: "ValuePanel",
            typeName: this.typeName,
            valueName: this.valueName_,
            allValidators
        } satisfies ValuePanelContext)
    }
}
