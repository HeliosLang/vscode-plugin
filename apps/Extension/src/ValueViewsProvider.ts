import { Schema } from "effect"
import {
    ChangeValueNameEvent,
    CreateValueEvent,
    EditValueEvent,
    PanelEvent,
    PanelIsReadyEvent,
    DeleteValueEvent
} from "schemas"
import { ExtensionContext } from "vscode"
import { loadWebview } from "./webview"
import { ValuesProvider } from "./ValuesProvider"
import { TypeSchemasProvider } from "./TypeSchemasProvider"
import { ValueViewPanel } from "./ValueViewPanel"
import { ASTProvider } from "./ASTProvider"

const VALUE_VIEW_REL_PATH = ["dist", "ValueView", "index.html"]

export class ValueViewsProvider {
    private readonly extensionContext: ExtensionContext
    private readonly schemasProvider: TypeSchemasProvider
    private readonly valuesProvider: ValuesProvider
    private readonly astProvider: ASTProvider
    private panels: ValueViewPanel[]

    constructor(
        extensionContext: ExtensionContext,
        astProvider: ASTProvider,
        schemasProvider: TypeSchemasProvider,
        valuesProvider: ValuesProvider
    ) {
        this.extensionContext = extensionContext
        this.astProvider = astProvider
        this.schemasProvider = schemasProvider
        this.valuesProvider = valuesProvider
        this.panels = []

        schemasProvider.addListener((schemas) => {
            this.panels.forEach((panel) => {
                panel.syncTypeSchemas(schemas)
            })
        })

        valuesProvider.addListener((store) => {
            this.panels.forEach((panel) => {
                panel.syncValueStore(store)
            })
        })
    }

    handleCreateValue(event: CreateValueEvent) {
        this.valuesProvider.handleCreateValue(event)

        this.addPanel(event.typeName, event.valueName)
    }

    handleEditValue(event: EditValueEvent) {
        console.log("Received event:", JSON.stringify(event, undefined, 4))

        const panel = this.panels.find(
            (panel) =>
                panel.typeName == event.typeName &&
                panel.valueName == event.valueName
        )

        if (panel) {
            panel.reveal()
        } else {
            this.addPanel(event.typeName, event.valueName)
        }
    }

    private get store() {
        return this.valuesProvider.store
    }

    private get schemas() {
        return this.schemasProvider.schemas
    }

    private async addPanel(typeName: string, valueName: string): Promise<void> {
        const panel = new ValueViewPanel(
            this.extensionContext,
            this.astProvider,
            typeName,
            valueName
        )

        panel.panel.onDidDispose(() => {
            this.purgePanel(panel)
        })

        panel.panel.webview.onDidReceiveMessage(
            async (unknownEvent: unknown) => {
                let event: PanelEvent
                try {
                    event = Schema.decodeUnknownSync(PanelEvent)(unknownEvent)
                } catch (_) {
                    console.error(
                        `Unhandled event in ValueViewsProvider: ${JSON.stringify(unknownEvent, undefined, 4)}`
                    )
                    return
                }

                switch (event.kind) {
                    case "PanelIsReady":
                        this.handlePanelIsReady(panel, event)
                        break
                    case "EditValue":
                        this.handleEditValue(event)
                        break
                    case "ChangeFieldValue":
                        this.valuesProvider.handleChangeFieldValue(event)
                        break
                    case "ChangeValueName":
                        this.handleChangeValueName(panel, event)
                        break
                    case "CreateValue": {
                        this.handleCreateValue(event)
                        break
                    }
                    case "DeleteValue":
                        this.handleDeleteValue(panel, event)
                        break
                    default:
                        console.error(
                            `Unhandled event in ValueViewsProvider: ${event.kind}`
                        )
                }
            }
        )

        this.panels.push(panel)

        await loadWebview(
            this.extensionContext,
            VALUE_VIEW_REL_PATH,
            panel.panel.webview
        )
    }

    private handlePanelIsReady(
        panel: ValueViewPanel,
        _event: PanelIsReadyEvent
    ) {
        panel.init(this.schemas, this.store)
    }

    private handleChangeValueName(
        panel: ValueViewPanel,
        event: ChangeValueNameEvent
    ) {
        panel.changeName(event.newName)

        if (event.newName != event.oldName) {
            this.valuesProvider.changeValueName(
                panel.typeName,
                event.oldName,
                event.newName
            )
        }
    }

    private handleDeleteValue(panel: ValueViewPanel, event: DeleteValueEvent) {
        panel.dispose()
        this.purgePanel(panel)
        this.valuesProvider.deleteValue(event.typeName, event.valueName)
    }

    private purgePanel(panel: ValueViewPanel) {
        this.panels = this.panels.filter((p) => p != panel)
    }
}
