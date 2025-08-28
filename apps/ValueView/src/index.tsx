import {
    ArgInput,
    GenericInputAction,
    ThickMinusIcon,
    ThickPlusIcon,
    useChangeValueName,
    useContextKey,
    useListData,
    useStoreHelper,
    useTypeSchemas,
    useUplcData,
    useVsCodeApi,
    ValidatedInput
} from "components"
import { ChangeEvent, StrictMode, useCallback, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { ErrorBoundary } from "react-error-boundary"
import { useValuePanelContext } from "./useValuePanelContext"
import {
    ChangeFieldValueEvent,
    makeDefaultValue,
    resolveSchema,
    type ValuePanelContext
} from "schemas"
import { bytesToHex, decodeUtf8 } from "@helios-lang/codec-utils"
import {
    expectDefined,
    FieldTypeSchema,
    TypeSchema,
    type StructTypeSchema
} from "@helios-lang/type-utils"
import { makeListData, type UplcData } from "@helios-lang/uplc"

import styles from "./styles.module.css"
import "components/styles.module.css"

const root = document.getElementById("root") as HTMLElement

createRoot(root).render(
    <StrictMode>
        <ErrorBoundary FallbackComponent={ErrorMessage}>
            <Main />
        </ErrorBoundary>
    </StrictMode>
)

function Main() {
    const context = useValuePanelContext()

    if (!context) {
        return <p>Loading...</p>
    }

    return (
        <div className={styles.main}>
            <h2>{context.typeName} value</h2>

            <NameInput context={context} />

            <MainInternal context={context} />
        </div>
    )
}

type NameInputProps = {
    context: ValuePanelContext
}

function NameInput({ context }: NameInputProps) {
    const store = useStoreHelper()
    const [error, setError] = useState("")
    const [name, setName] = useState(context.valueName)
    const changeName = useChangeValueName()

    const handleChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const newName = event.target.value.trim()
            setName(newName)

            if (newName == "") {
                setError("empty")
            } else if (store.hasValue(context.typeName, newName)) {
                setError(`'${newName}' already used`)
            } else if (
                newName.includes(" ") ||
                newName.includes("\t") ||
                newName.includes("\n")
            ) {
                setError(`contains whitespace`)
            } else if (newName.match(/[^a-zA-Z0-9_\-]/)) {
                setError(`contains illegal characters`)
            } else {
                setError("")
                changeName(newName)
            }
        },
        [context, store, setError, setName, changeName]
    )

    return (
        <>
            <label>
                <h3>Name</h3>
            </label>
            <ValidatedInput
                value={name}
                onChange={handleChange}
                error={error}
            />
        </>
    )
}

type MainInternalProps = {
    context: ValuePanelContext
}

function MainInternal({ context }: MainInternalProps) {
    const schemas = useTypeSchemas()
    const store = useStoreHelper()

    const type = context.typeName
    const name = context.valueName

    const initialValue = useMemo(() => {
        return expectDefined(store.getValue(type, name))
    }, [store, type, name])

    if (type.startsWith("[]")) {
        return (
            <GenericListInput
                itemType={type.slice(2)}
                initialValue={initialValue}
            />
        )
    } else if (type.startsWith("Map[")) {
        const [keyType, ...valueType] = type.slice(4).split("]")

        return (
            <GenericMapInput
                keyType={keyType}
                valueType={valueType.join("")}
                initialValue={initialValue}
            />
        )
    } else if (type in schemas) {
        const schema = schemas[type]

        if (schema.kind == "struct") {
            return (
                <GenericStructInput
                    schema={schema}
                    initialValue={initialValue}
                />
            )
        }
    }

    return <p>Unhandled type {type}</p>
}

type ErrorMessageProps = {
    error: Error
}

function ErrorMessage({ error }: ErrorMessageProps) {
    return <p>{error.message}</p>
}

type GenericListInputProps = {
    itemType: string
    initialValue?: string
}

function GenericListInput({ itemType, initialValue }: GenericListInputProps) {
    const data = useUplcData(initialValue)
    const vscode = useVsCodeApi()
    const schemas = useTypeSchemas()
    const contextKey = useContextKey()

    const initialListValue = useMemo(() => {
        if (data?.kind == "list") {
            return data
        } else {
            return makeListData([])
        }
    }, [data])

    const n = initialListValue.length

    const handleAddItem = useCallback(() => {
        const schema = resolveSchema(schemas, itemType)
        const fieldValue = makeDefaultValue(schema)
        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey: contextKey,
            fieldType: itemType,
            fieldName: `item-${n}`,
            fieldValue
        } satisfies ChangeFieldValueEvent)
    }, [vscode, contextKey, n, itemType, schemas])

    const handleRemoveItem = useCallback(() => {
        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey: contextKey,
            fieldType: itemType,
            fieldName: `item-${n - 1}`,
            fieldValue: ""
        } satisfies ChangeFieldValueEvent)
    }, [vscode, contextKey, n, itemType])

    return (
        <>
            <h3>Items ({n})</h3>
            {initialListValue.items.map((item, i) => {
                const initialValue = item
                const cborHex = bytesToHex(initialValue.toCbor())

                return (
                    <ArgInput
                        fieldName={"item-" + i.toString()}
                        fieldType={itemType}
                        fieldValue={cborHex}
                    />
                )
            })}

            <div className={styles.actions}>
                <GenericInputAction onClick={handleAddItem}>
                    <ThickPlusIcon />
                </GenericInputAction>

                <GenericInputAction
                    onClick={handleRemoveItem}
                    disabled={initialListValue.items.length == 0}
                >
                    <ThickMinusIcon />
                </GenericInputAction>
            </div>
        </>
    )
}

type GenericMapInputProps = {
    keyType: string
    valueType: string
    initialValue?: string
}

function GenericMapInput({
    keyType,
    valueType,
    initialValue
}: GenericMapInputProps) {
    const data = useUplcData(initialValue)

    const initialMapValue = useMemo(() => {
        if (data && data.kind == "map") {
            return data
        } else {
            return undefined
        }
    }, [data])

    const nItems = useState(initialMapValue ? initialMapValue.length : 1)

    return (
        <>
            <h3>Entries</h3>
            {new Array(nItems).map((_, i) => {
                const initialKeyValue = expectDefined(
                    initialMapValue?.items?.[i]?.[0]
                )
                const keyCborHex = bytesToHex(initialKeyValue.toCbor())

                const initialValueValue = expectDefined(
                    initialMapValue?.items?.[i]?.[1]
                )
                const valueCborHex = bytesToHex(initialValueValue.toCbor())

                return (
                    <div>
                        <ArgInput
                            fieldName={"key-" + i.toString()}
                            fieldType={keyType}
                            fieldValue={keyCborHex}
                        />
                        <ArgInput
                            fieldName={"value-" + i.toString()}
                            fieldType={valueType}
                            fieldValue={valueCborHex}
                        />
                    </div>
                )
            })}
        </>
    )
}

type GenericStructInputProps = {
    schema: StructTypeSchema
    initialValue: string
}

function GenericStructInput({ schema, initialValue }: GenericStructInputProps) {
    return (
        <>
            <h3>Fields</h3>

            {schema.format == "singleton" ? (
                <GenericSingletonStructInput
                    field={schema.fieldTypes[0]}
                    initialValue={initialValue}
                />
            ) : schema.format == "list" ? (
                <GenericListStructInput
                    fields={schema.fieldTypes}
                    initialValue={initialValue}
                />
            ) : (
                <GenericMapStructInput
                    fields={schema.fieldTypes}
                    initialValue={initialValue}
                />
            )}
        </>
    )
}

type GenericSingletonStructInputProps = {
    field: FieldTypeSchema
    initialValue: string
}

function GenericSingletonStructInput({
    field,
    initialValue
}: GenericSingletonStructInputProps) {
    return (
        <ArgInput
            fieldName={field.name}
            fieldType={getTypeSchemaName(field.type)}
            fieldValue={initialValue}
        />
    )
}

type GenericListStructInputProps = {
    fields: FieldTypeSchema[]
    initialValue?: string
}

function GenericListStructInput({
    fields,
    initialValue
}: GenericListStructInputProps) {
    const data = useUplcData(initialValue)
    const initialListValue = useListData(data)

    return (
        <>
            {fields.map((f, i) => {
                const initialValue = expectDefined(initialListValue?.items?.[i])
                const cborHex = bytesToHex(initialValue.toCbor())

                return (
                    <ArgInput
                        key={f.name}
                        fieldName={f.name}
                        fieldType={getTypeSchemaName(f.type)}
                        fieldValue={cborHex}
                    />
                )
            })}
        </>
    )
}

type GenericMapStructInputProps = {
    fields: FieldTypeSchema[]
    initialValue?: string
}

function GenericMapStructInput({
    fields,
    initialValue
}: GenericMapStructInputProps) {
    const data = useUplcData(initialValue)

    const initialMapEntries = useMemo(() => {
        if (data?.kind == "map") {
            const entries: Record<string, UplcData> = {}

            for (let i = 0; i < data.items.length; i++) {
                const [key, value] = data.items[i]

                if (key.kind == "bytes") {
                    try {
                        const k = decodeUtf8(key.bytes)
                        if (k == fields[i]?.key) {
                            entries[k] = value
                        }
                    } catch (_) {
                        continue
                    }
                }
            }

            return entries
        } else {
            return undefined
        }
    }, [data, fields])

    return (
        <>
            {fields.map((f) => {
                const initialValue = expectDefined(
                    initialMapEntries?.[expectDefined(f.key)]
                )
                const cborHex = bytesToHex(initialValue.toCbor())

                return (
                    <ArgInput
                        key={f.name}
                        fieldName={f.name}
                        fieldType={getTypeSchemaName(f.type)}
                        fieldValue={cborHex}
                    />
                )
            })}
        </>
    )
}

function getTypeSchemaName(schema: TypeSchema): string {
    if (schema.kind == "internal") {
        return schema.name
    } else if (schema.kind == "list") {
        return `[]${getTypeSchemaName(schema.itemType)}`
    } else if (schema.kind == "map") {
        return `Map[${getTypeSchemaName(schema.keyType)}]${getTypeSchemaName(schema.valueType)}`
    } else if (schema.kind == "option") {
        return `Option[${getTypeSchemaName(schema.someType)}]`
    } else if (schema.kind == "reference") {
        return schema.id.split("_").pop() || "unknown"
    } else if (schema.kind == "enum" || schema.kind == "struct") {
        return schema.name
    } else if (schema.kind == "variant") {
        return schema.name
    } else if (schema.kind == "tuple") {
        return `(${schema.itemTypes.map(getTypeSchemaName).join(",")})`
    }

    return "unknown"
}
