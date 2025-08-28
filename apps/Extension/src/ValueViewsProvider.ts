import { Schema } from "effect"
import {
    ChangeValueNameEvent,
    CreateValueEvent,
    EditValueEvent,
    PanelEvent,
    PanelIsReadyEvent,
    ValuePanelContext,
    type Store,
    type ValueStoreContext,
    type TypeSchemasContext
} from "schemas"
import { ExtensionContext, ViewColumn, WebviewPanel, window } from "vscode"
import { type TypeSchema } from "@helios-lang/type-utils"
import { loadWebview } from "./webview"
import { ValuesProvider } from "./ValuesProvider"
import { TypeSchemasProvider } from "./TypeSchemasProvider"

const VALUE_VIEW_REL_PATH = ["dist", "ValueView", "index.html"]

type PanelWithProps = {
    readonly panel: WebviewPanel
    readonly typeName: string
    valueName: string
}

export class ValueViewsProvider {
    private readonly extensionContext: ExtensionContext
    private readonly schemasProvider: TypeSchemasProvider
    private readonly valuesProvider: ValuesProvider
    private panels: WebviewPanel[]

    constructor(
        extensionContext: ExtensionContext,
        schemasProvider: TypeSchemasProvider,
        valuesProvider: ValuesProvider
    ) {
        this.extensionContext = extensionContext
        this.schemasProvider = schemasProvider
        this.valuesProvider = valuesProvider
        this.panels = []

        schemasProvider.addListener((schemas) => {
            this.panels.forEach((panel) => {
                sendTypeSchemasContextToPanel(panel, schemas)
            })
        })

        valuesProvider.addListener((store) => {
            this.panels.forEach((panel) => {
                sendValueStoreContextToPanel(panel, store)
            })
        })
    }

    handleEditValue(event: EditValueEvent) {
        this.addPanel(event.typeName, event.valueName)
    }

    private get store() {
        return this.valuesProvider.store
    }

    private get schemas() {
        return this.schemasProvider.schemas
    }

    private async addPanel(typeName: string, valueName: string): Promise<void> {
        const panelName = `helios-${typeName}-value`

        const panelTitle = `${typeName} value`

        const panel = window.createWebviewPanel(
            panelName,
            panelTitle,
            ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        )

        const panelWithProps: PanelWithProps = {
            panel,
            typeName,
            valueName
        }

        panel.webview.options = {
            enableScripts: true
        }

        panel.onDidDispose(() => {
            this.panels = this.panels.filter((p) => p != panel)
        })

        panel.webview.onDidReceiveMessage(async (unknownEvent: unknown) => {
            try {
                const event = Schema.decodeUnknownSync(PanelEvent)(unknownEvent)

                switch (event.kind) {
                    case "PanelIsReady":
                        this.handlePanelIsReady(panelWithProps, event)
                        break
                    case "EditValue":
                        this.handleEditValue(event)
                        break
                    case "ChangeFieldValue":
                        this.valuesProvider.handleChangeFieldValue(event)
                        break
                    case "ChangeValueName":
                        this.handleChangeValueName(panelWithProps, event)
                        break
                    case "CreateValue": {
                        this.handleCreateValue(event)
                        break
                    }
                    default:
                        console.error(
                            `Unhandled event "${event.kind}" in ValueViewCollection`
                        )
                }
            } catch (e) {
                console.error(
                    `Unhandled event in ValueViewCollection (${(e as Error).message})`
                )
            }
        })

        this.panels.push(panel)

        await loadWebview(
            this.extensionContext,
            VALUE_VIEW_REL_PATH,
            panel.webview
        )
    }

    private handlePanelIsReady(
        panel: PanelWithProps,
        _event: PanelIsReadyEvent
    ) {
        // configure the panel
        sendValueStoreContextToPanel(panel.panel, this.store)
        sendTypeSchemasContextToPanel(panel.panel, this.schemas)
        sendValuePanelContextToPanel(
            panel.panel,
            panel.typeName,
            panel.valueName
        )
    }

    private handleChangeValueName(
        panel: PanelWithProps,
        event: ChangeValueNameEvent
    ) {
        if (event.newName != panel.valueName) {
            panel.valueName = event.newName
            sendValuePanelContextToPanel(
                panel.panel,
                panel.typeName,
                event.newName
            )
        }

        if (event.newName != event.oldName) {
            this.valuesProvider.changeValueName(
                panel.typeName,
                event.oldName,
                event.newName
            )
        }
    }

    private handleCreateValue(event: CreateValueEvent) {
        this.valuesProvider.handleCreateValue(event)

        this.addPanel(event.typeName, event.valueName)
    }
}

export function sendTypeSchemasContextToPanel(
    panel: WebviewPanel,
    schemas: Record<string, TypeSchema>
) {
    const event: TypeSchemasContext = {
        kind: "TypeSchemas",
        schemas
    }

    panel.webview.postMessage(event)
}

export function sendValueStoreContextToPanel(panel: WebviewPanel, s: Store) {
    const event: ValueStoreContext = {
        kind: "ValueStore",
        store: s
    }

    panel.webview.postMessage(event)
}

function sendValuePanelContextToPanel(
    panel: WebviewPanel,
    typeName: string,
    valueName: string
) {
    const event: ValuePanelContext = {
        kind: "ValuePanel",
        typeName: typeName,
        valueName: valueName
    }

    panel.webview.postMessage(event)
}
