import { TypeSchema, type ListTypeSchema } from "@helios-lang/type-utils"
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

type GenericListFormProps = {
    prefix: string
    sectionTitle: ReactNode
    itemSchema: TypeSchema
    fields: Record<string, string>
}

export function GenericListForm({ prefix, itemSchema, sectionTitle, fields }: GenericListFormProps) {
    const vscode = useVsCodeApi()
    const contextKey = useContextKey()

    const n = countListItems(fields, prefix)

    const handleAddItem = useCallback(() => {
        const fieldValue = makeDefaultValue(itemSchema)

        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: deriveTypeName(itemSchema),
            fieldName: `${prefix}-${n}`,
            fieldValue
        } satisfies ChangeFieldValueEvent)
    }, [vscode, contextKey, itemSchema, prefix, n])

    const handleRemoveItem = useCallback(() => {
        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: deriveTypeName(itemSchema),
            fieldName: `${prefix}-${n - 1}`,
            fieldValue: ""
        } satisfies ChangeFieldValueEvent)
    }, [vscode, contextKey, itemSchema, prefix, n])

    return (
        <>
            <h3>{sectionTitle} ({n})</h3>
            {collectListItems(fields, prefix).map((fieldValue, i) => {
                const key = `item-${i}`
                return (
                    <ArgInput
                        key={key}
                        fieldName={key}
                        fieldType={deriveTypeName(itemSchema)}
                        fieldValue={fieldValue}
                    />
                )
            })}

            <div className={styles.actions}>
                <IconButton onClick={handleAddItem}>
                    <ThickPlusIcon />
                </IconButton>

                <IconButton
                    onClick={handleRemoveItem}
                    disabled={n == 0}
                    tooltip={n == 0 ? "Already empty" : undefined}
                >
                    <ThickMinusIcon />
                </IconButton>
            </div>
        </>
    )
}

function countListItems(fields: Record<string, string>, prefix: string = "item"): number {
    let n = 0

    while (true) {
        if (`${prefix}-${n}` in fields) {
            n++
        } else {
            break
        }
    }

    return n
}

function collectListItems(fields: Record<string, string>, prefix: string = "item"): string[] {
    let i = 0

    const items: string[] = []

    while (true) {
        const item = fields[`${prefix}-${i}`]

        if (item) {
            items.push(item)
            i++
        } else {
            break
        }
    }

    return items
}
