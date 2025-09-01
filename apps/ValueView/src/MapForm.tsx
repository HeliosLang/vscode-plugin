import { type MapTypeSchema } from "@helios-lang/type-utils"
import {
    ArgInput,
    IconButton,
    ThickMinusIcon,
    ThickPlusIcon,
    useContextKey,
    useVsCodeApi
} from "components"
import { useCallback } from "react"
import {
    ChangeFieldValueEvent,
    deriveTypeName,
    makeDefaultValue
} from "schemas"

import styles from "./styles.module.css"

type MapFormProps = {
    schema: MapTypeSchema
    fields: Record<string, string>
}

export function MapForm({ schema, fields }: MapFormProps) {
    const vscode = useVsCodeApi()
    const contextKey = useContextKey()

    const n = countMapEntries(fields)

    const handleAddEntry = useCallback(() => {
        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: deriveTypeName(schema.keyType),
            fieldName: `key-${n}`,
            fieldValue: makeDefaultValue(schema.keyType)
        } satisfies ChangeFieldValueEvent)

        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: deriveTypeName(schema.valueType),
            fieldName: `value-${n}`,
            fieldValue: makeDefaultValue(schema.valueType)
        } satisfies ChangeFieldValueEvent)
    }, [vscode, contextKey, schema, n])

    const handleRemoveEntry = useCallback(() => {
        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: deriveTypeName(schema.keyType),
            fieldName: `key-${n - 1}`,
            fieldValue: ""
        } satisfies ChangeFieldValueEvent)

        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: deriveTypeName(schema.valueType),
            fieldName: `value-${n - 1}`,
            fieldValue: ""
        } satisfies ChangeFieldValueEvent)
    }, [vscode, contextKey, schema, n])

    return (
        <>
            <h3>Entries ({n})</h3>
            {collectMapEntries(fields).map(([key, value], i) => {
                const entryKey = `key-${i}`

                return (
                    <div key={entryKey}>
                        <ArgInput
                            fieldName={entryKey}
                            fieldType={deriveTypeName(schema.keyType)}
                            fieldValue={key}
                        />
                        <ArgInput
                            fieldName={`value-${i}`}
                            fieldType={deriveTypeName(schema.valueType)}
                            fieldValue={value}
                        />
                    </div>
                )
            })}

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

function countMapEntries(fields: Record<string, string>): number {
    let n = 0

    while (true) {
        if (`key-${n}` in fields && `value-${n}` in fields) {
            n++
        } else {
            break
        }
    }

    return n
}

function collectMapEntries(fields: Record<string, string>): [string, string][] {
    let i = 0

    const entries: [string, string][] = []

    while (true) {
        const key = fields[`key-${i}`]
        const value = fields[`value-${i}`]

        if (key && value) {
            entries.push([key, value])
            i++
        } else {
            break
        }
    }

    return entries
}
