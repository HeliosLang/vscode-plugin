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
import { Uri, workspace, window } from "vscode"
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
    private uri: Uri | undefined
    private ready: Promise<void>
    private operations: Promise<void> = Promise.resolve()

    constructor(schemasProvider: TypeSchemasProvider) {
        this.schemasProvider = schemasProvider
        this.store_ = { values: {}, links: {} }

        this.listeners = []

        this.uri = getValueStoreUri()
        this.ready = readValueStore(this.uri).then((s) => {
            this.store_ = s
            this.listeners.forEach((l) => l(s))
        })
        // Keep corrupt files intact; every operation also awaits ready and fails.
        void this.ready.catch((error) =>
            window.showErrorMessage(
                `Cannot load Helios values: ${error.message}`
            )
        )
    }

    private enqueue(action: () => Promise<void>): Promise<void> {
        const operation = this.operations.then(async () => {
            await this.ready
            await action()
        })
        this.operations = operation.catch((error) => {
            window.showErrorMessage(
                `Cannot update Helios values: ${error.message}`
            )
        })
        return operation
    }

    selectDocument(document: Uri): Promise<void> {
        return this.enqueue(async () => {
            const uri = this.documentStoreUri(document)
            if (uri.toString() === this.uri?.toString()) return
            const store = await readValueStore(uri)
            this.uri = uri
            this.store_ = store
            this.listeners.forEach((l) => l(store))
        })
    }

    importIntoDocument(
        document: Uri,
        prepare: (store: Store) => Store
    ): Promise<void> {
        return this.enqueue(async () => {
            const uri = this.documentStoreUri(document)
            const previous =
                uri.toString() === this.uri?.toString()
                    ? this.store_
                    : await readValueStore(uri)
            const store = prepare(previous)
            await writeValueStore(store, uri)
            this.uri = uri
            this.store_ = store
            this.listeners.forEach((l) => l(store))
        })
    }

    private documentStoreUri(document: Uri): Uri {
        const folder = workspace.getWorkspaceFolder(document)
        if (!folder)
            throw new Error("Validator must be inside a workspace folder")
        return Uri.joinPath(folder.uri, ...STORE_REL_PATH)
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
        void this.enqueue(async () => {
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

            await this.flush()
        }).catch(() => {})
    }

    /**
     * Removes fields from the values
     * Removes links that target this value (and set corresponding field value to NIL)
     * Removes links used by this value
     * @param typeName
     * @param valueName
     */
    deleteValue(typeName: string, valueName: string): void {
        void this.enqueue(async () => {
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

                        const schema =
                            this.schemasProvider.resolveSchema(typeName)
                        const fieldValue = makeNilValue(schema)

                        this.setFieldValue(contextKey, fieldName, fieldValue)
                    }
                }
            }

            await this.flush()
        }).catch(() => {})
    }

    /**
     *
     * @param event
     */
    handleChangeFieldValue(event: ChangeFieldValueEvent): void {
        void this.enqueue(async () => {
            this.setFieldValue(
                event.contextKey,
                event.fieldName,
                event.fieldValue
            )

            // at this point all values have been updated recursively, we can now change the link
            const linkKey = `${event.contextKey}::${event.fieldName}`
            if (event.link) {
                this.store_.links[linkKey] = event.link
            } else if (linkKey in this.store_.links) {
                delete this.store_.links[linkKey]
            }

            await this.flush()
        }).catch(() => {})
    }

    /**
     * Uses the associated type schema to create default field values
     * Then stores those default field values, and optionally links to the caller field name
     * @param event
     */
    handleCreateValue(event: CreateValueEvent): void {
        void this.enqueue(async () => {
            const { values, links } = this.store

            const schema = this.schemasProvider.resolveSchema(event.typeName)
            const fieldValues = makeDefaultFieldValues(schema)
            const key = `${event.typeName}::${event.valueName}`

            values[key] = fieldValues

            if (event.linkToCaller) {
                links[`${event.callerContextKey}::${event.callerFieldName}`] =
                    key

                this.setFieldValue(
                    event.callerContextKey,
                    event.callerFieldName,
                    bytesToHex(
                        convertFieldsToUplcData(schema, fieldValues).toCbor()
                    )
                )
            }

            await this.flush()
        }).catch(() => {})
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
                    convertFieldsToUplcData(
                        schema(),
                        values[contextKey]
                    ).toCbor()
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

    private async flush() {
        await writeValueStore(this.store_, this.uri)
        this.listeners.forEach((l) => l(this.store_))
    }
}

async function readValueStore(uri: Uri | undefined): Promise<Store> {
    if (!uri) {
        return { values: {}, links: {} }
    }

    try {
        const content = await workspace.fs.readFile(uri)
        const text = new TextDecoder("utf-8").decode(content)

        const store = Schema.decodeUnknownSync(Schema.parseJson(Store))(text)
        for (const [key, fields] of Object.entries(store.values)) {
            if (
                key.startsWith("Tx::") &&
                fields.refInputs !== undefined &&
                fields.ref_inputs === undefined
            ) {
                fields.ref_inputs = fields.refInputs
                delete fields.refInputs
            }
        }
        for (const key of Object.keys(store.links))
            if (key.startsWith("Tx::") && key.endsWith("::refInputs")) {
                store.links[key.slice(0, -9) + "ref_inputs"] = store.links[key]
                delete store.links[key]
            }
        return store
    } catch (e: any) {
        if (e.code === "ENOENT" || e.code === "FileNotFound")
            return { values: {}, links: {} }
        throw new Error(
            "Cannot read .vscode/heliosdebugger.json; fix its contents or permissions before editing values."
        )
    }
}

async function writeValueStore(
    store: Store,
    uri: Uri | undefined
): Promise<void> {
    if (!uri) return
    await workspace.fs.createDirectory(Uri.joinPath(uri, ".."))
    await workspace.fs.writeFile(
        uri,
        new TextEncoder().encode(JSON.stringify(store, undefined, 4))
    )
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
