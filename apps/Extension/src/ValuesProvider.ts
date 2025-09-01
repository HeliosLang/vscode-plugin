import { Schema } from "effect"
import {
    ChangeFieldValueEvent,
    convertFieldsToUplcData,
    correctTagChange,
    CreateValueEvent,
    makeDefaultFieldValues,
    makeDefaultValue,
    makeNilFieldValues,
    makeNilValue,
    resolveSchema,
    Store,
    tryResolveSchema,
    validateUplcData
} from "schemas"
import { Uri, workspace } from "vscode"
import { bytesToHex } from "@helios-lang/codec-utils"
import { TypeSchemasProvider } from "./TypeSchemasProvider"
import { expectDefined, TypeSchema } from "@helios-lang/type-utils"
import { decodeUplcData } from "@helios-lang/uplc"

const STORE_REL_PATH = [".vscode", "heliosdebugger.json"]

type ValuesListener = (s: Store) => void

/**
 * `ValueStore` wraps the store of helios debugger values stored on disk
 */
export class ValuesProvider {
    private readonly schemasProvider: TypeSchemasProvider
    private store_: Store
    private listeners: ValuesListener[]

    constructor(schemasProvider: TypeSchemasProvider) {
        this.schemasProvider = schemasProvider
        this.store_ = { values: {}, links: {} }

        this.listeners = []

        readValueStore().then((s) => {
            this.store_ = s
            this.listeners.forEach((l) => l(s))
        })
    }

    get store() {
        return this.store_
    }

    addListener(callback: ValuesListener) {
        callback(this.store_)
        this.listeners.push(callback)
    }

    /**
     * Changes:
     *   - store keys
     *   - link values
     *   - link key prefixes
     *
     * @param typeName
     * @param oldName
     * @param newName
     */
    changeValueName(typeName: string, oldName: string, newName: string): void {
        const oldKey = `${typeName}::${oldName}`
        const newKey = `${typeName}::${newName}`

        const { values, links } = this.store

        if (oldKey in values) {
            values[newKey] = values[oldKey]
            delete values[oldKey]
        }

        for (let linkKey in links) {
            const linkValue = links[linkKey]

            if (linkValue == oldKey) {
                links[linkKey] = newKey
            }

            if (linkKey.startsWith(oldKey + "::")) {
                const newLinkKey =
                    newKey + "::" + linkKey.slice(oldKey.length + 2)
                links[newLinkKey] = links[linkKey]
                delete links[linkKey]
            }
        }

        this.flush()
    }

    /**
     * Removes fields from the values
     * Removes links that target this value (and set corresponding field value to NIL)
     * Removes links used by this value
     * @param typeName
     * @param valueName
     */
    deleteValue(typeName: string, valueName: string): void {
        const key = `${typeName}::${valueName}`

        if (key in this.store.values) {
            delete this.store.values[key]
        }

        for (let linkKey in this.store.links) {
            if (linkKey.startsWith(key + "::")) {
                delete this.store.links[linkKey]
            } else {
                const linkValue = this.store.links[linkKey]

                if (linkValue == key) {
                    delete this.store.links[linkKey]

                    // TODO: reusable split functions
                    const linkKeyParts = linkKey.split("::")
                    const contextKey = linkKeyParts
                        .slice(0, linkKeyParts.length - 1)
                        .join("::")
                    const fieldName = linkKeyParts[linkKeyParts.length - 1]

                    const schema = this.schemasProvider.resolveSchema(typeName)
                    const fieldValue = makeNilValue(schema)

                    this.setFieldValue(contextKey, fieldName, fieldValue)
                }
            }
        }

        this.flush()
    }

    /**
     *
     * @param event
     */
    handleChangeFieldValue(event: ChangeFieldValueEvent): void {
        console.log("Received event: ", JSON.stringify(event, undefined, 4))

        this.setFieldValue(event.contextKey, event.fieldName, event.fieldValue)

        // at this point all values have been updated recursively, we can now change the link
        const linkKey = `${event.contextKey}::${event.fieldName}`
        if (event.link) {
            this.store_.links[linkKey] = event.link
        } else if (linkKey in this.store_.links) {
            delete this.store_.links[linkKey]
        }

        this.flush()
    }

    /**
     * Uses the associated type schema to create default field values
     * Then stores those default field values, and optionally links to the caller field name
     * @param event
     */
    handleCreateValue(event: CreateValueEvent): void {
        const { values, links } = this.store

        const schema = this.schemasProvider.resolveSchema(event.typeName)
        const fieldValues = makeDefaultFieldValues(schema)
        const key = `${event.typeName}::${event.valueName}`

        values[key] = fieldValues

        if (event.linkToCaller) {
            links[`${event.callerContextKey}::${event.callerFieldName}`] = key

            this.setFieldValue(
                event.callerContextKey,
                event.callerFieldName,
                bytesToHex(
                    convertFieldsToUplcData(schema, fieldValues).toCbor()
                )
            )
        }

        this.flush()
    }

    /**
     * Sets a field value and then updates linked values recursively
     * @param contextKey
     * @param fieldName
     * @param fieldValue
     * An empty fieldValue string deletes the field
     */
    private setFieldValue(
        contextKey: string,
        fieldName: string,
        fieldValue: string
    ) {
        const { values, links } = this.store

        if (!(contextKey in values)) {
            values[contextKey] = {}
        }

        if (fieldValue == "" && fieldName in values[contextKey]) {
            const obj = values[contextKey]
            delete obj[fieldName]
        } else {
            values[contextKey][fieldName] = fieldValue
        }

        // lazy, because doesn't work with ArgsPanelContext
        let schema_: TypeSchema | undefined = undefined

        const schema = (): TypeSchema => {
            if (!schema_) {
                console.log(`Resolving schema ${contextKey}`)
                const keyParts = contextKey.split("::")
                const typeName = keyParts
                    .slice(0, keyParts.length - 1)
                    .join("::")
    
                schema_ = resolveSchema(this.schemasProvider.schemas, typeName)
                console.log(`Resolved schema ${contextKey}`)
            }

            return schema_
        }

        if (fieldName == "_tag") {
            correctTagChange(schema(), parseInt(fieldValue), values[contextKey])
        }

        let fullValue_: string | undefined = undefined

        const fullValue = (): string => {
            if (!fullValue_) {
                fullValue_ = bytesToHex(
                    convertFieldsToUplcData(schema(), values[contextKey]).toCbor()
                )
            }

            return fullValue_
        }

        // any other value linked to the contextKey must also be changed
        for (let linkKey in links) {
            const linkValue = links[linkKey]

            if (linkValue == contextKey) {
                const linkKeyParts = linkKey.split("::")
                const linkContextKey = linkKeyParts
                    .slice(0, linkKeyParts.length - 1)
                    .join("::")
                const linkFieldName = linkKeyParts[linkKeyParts.length - 1]

                this.setFieldValue(linkContextKey, linkFieldName, fullValue())
            }
        }
    }

    private flush() {
        writeValueStore(this.store_).then(() => {
            this.listeners.forEach((l) => l(this.store_))
        })
    }
}

async function readValueStore(): Promise<Store> {
    const uri = getValueStoreUri()

    if (!uri) {
        return { values: {}, links: {} }
    }

    try {
        const content = await workspace.fs.readFile(uri)
        const text = new TextDecoder("utf-8").decode(content)

        return Schema.decodeUnknownSync(Schema.parseJson(Store))(text)
    } catch (e: any) {
        if (e.code != "ENOENT") {
            console.log(`Failed to read store: ${e} (code=${e.code})`)
        }

        return { values: {}, links: {} }
    }
}

async function writeValueStore(store: Store): Promise<void> {
    const uri = getValueStoreUri()

    if (!uri) {
        return
    }

    try {
        const content = JSON.stringify(store, undefined, 4)
        const encodedContent = new TextEncoder().encode(content)
        await workspace.fs.writeFile(uri, encodedContent)
    } catch (e) {
        // log error?
        return
    }
}

function getValueStoreUri(): Uri | undefined {
    // workspaceFolders is undefined if no folder is open
    const folders = workspace.workspaceFolders
    if (!folders || folders.length === 0) {
        return undefined
    }

    // Assume the first folder is the workspace root
    const rootUri = folders[0].uri

    // Construct the path to .vscode/heliosdebugger.json
    return Uri.joinPath(rootUri, ...STORE_REL_PATH)
}
