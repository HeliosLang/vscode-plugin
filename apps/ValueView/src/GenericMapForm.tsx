import { type MapTypeSchema } from "@helios-lang/type-utils"
import {
    ArgInput,
    IconButton,
    ThickMinusIcon,
    ThickPlusIcon,
    useContextKey,
    useVsCodeApi
} from "components"
import { ReactNode, useCallback } from "react"
import {
    ChangeFieldValueEvent,
    deriveTypeName,
    makeDefaultValue
} from "schemas"

import styles from "./styles.module.css"

type GenericMapFormProps = {
    schema: MapTypeSchema
    sectionTitle?: ReactNode
    keyPrefix: string
    valuePrefix: string
    fields: Record<string, string>
}

export function GenericMapForm({
    schema,
    fields,
    sectionTitle,
    keyPrefix,
    valuePrefix
}: GenericMapFormProps) {
    const vscode = useVsCodeApi()
    const contextKey = useContextKey()

    const n = countMapEntries(fields, keyPrefix, valuePrefix)

    const handleAddEntry = useCallback(() => {
        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: deriveTypeName(schema.keyType),
            fieldName: `${keyPrefix}-${n}`,
            fieldValue: makeDefaultValue(schema.keyType)
        } satisfies ChangeFieldValueEvent)

        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: deriveTypeName(schema.valueType),
            fieldName: `${valuePrefix}-${n}`,
            fieldValue: makeDefaultValue(schema.valueType)
        } satisfies ChangeFieldValueEvent)
    }, [vscode, contextKey, schema, n, keyPrefix, valuePrefix])

    const handleRemoveEntry = useCallback(() => {
        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: deriveTypeName(schema.keyType),
            fieldName: `${keyPrefix}-${n - 1}`,
            fieldValue: ""
        } satisfies ChangeFieldValueEvent)

        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: deriveTypeName(schema.valueType),
            fieldName: `${valuePrefix}-${n - 1}`,
            fieldValue: ""
        } satisfies ChangeFieldValueEvent)
    }, [vscode, contextKey, schema, n, keyPrefix, valuePrefix])

    return (
        <>
            {sectionTitle || <h3>Entries ({n})</h3>}
            {collectMapEntries(fields, keyPrefix, valuePrefix).map(
                ([key, value], i) => {
                    const entryKey = `${keyPrefix}-${i}`

                    return (
                        <div key={entryKey}>
                            <ArgInput
                                fieldName={entryKey}
                                fieldType={deriveTypeName(schema.keyType)}
                                fieldValue={key}
                            />
                            <ArgInput
                                fieldName={`${valuePrefix}-${i}`}
                                fieldType={deriveTypeName(schema.valueType)}
                                fieldValue={value}
                            />
                        </div>
                    )
                }
            )}

            <div className={styles.actions}>
                <IconButton onClick={handleAddEntry}>
                    <ThickPlusIcon />
                </IconButton>

                <IconButton
                    onClick={handleRemoveEntry}
                    disabled={n == 0}
                    tooltip={n == 0 ? "Map is empty" : undefined}
                >
                    <ThickMinusIcon />
                </IconButton>
            </div>
        </>
    )
}

function countMapEntries(
    fields: Record<string, string>,
    keyPrefix: string = "key",
    valuePrefix: string = "value"
): number {
    let n = 0

    while (true) {
        if (`${keyPrefix}-${n}` in fields && `${valuePrefix}-${n}` in fields) {
            n++
        } else {
            break
        }
    }

    return n
}

function collectMapEntries(
    fields: Record<string, string>,
    keyPrefix: string = "key",
    valuePrefix: string = "value"
): [string, string][] {
    let i = 0

    const entries: [string, string][] = []

    while (true) {
        const key = fields[`${keyPrefix}-${i}`]
        const value = fields[`${valuePrefix}-${i}`]

        if (key && value) {
            entries.push([key, value])
            i++
        } else {
            break
        }
    }

    return entries
}
