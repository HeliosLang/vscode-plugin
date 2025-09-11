import { useCallback } from "react"
import { collectListItems, countListItems } from "./GenericListForm"
import { ChangeFieldValueEvent, makeDefaultValue } from "schemas"
import { MapTypeSchema } from "@helios-lang/type-utils"
import {
    ArgInput,
    IconButton,
    ThickMinusIcon,
    ThickPlusIcon,
    useContextKey,
    useVsCodeApi
} from "components"
import styles from "./styles.module.css"
import { GenericMapForm } from "./GenericMapForm"

type ValueFormProps = {
    fields: Record<string, string>
}

const INNER_SCHEMA: MapTypeSchema = {
    kind: "map",
    keyType: { kind: "internal", name: "ByteArray" },
    valueType: { kind: "internal", name: "Int" }
}

// a list of a map?
export function ValueForm({ fields }: ValueFormProps) {
    const vscode = useVsCodeApi()
    const contextKey = useContextKey()
    const n = countListItems(fields, "policy")

    const handleAddPolicy = useCallback(() => {
        const fieldValue = makeDefaultValue({
            kind: "internal",
            name: "MintingPolicyHashk"
        })

        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: "MintingPolicyHash",
            fieldName: `policy-${n}`,
            fieldValue
        } satisfies ChangeFieldValueEvent)
    }, [vscode, contextKey, n])

    const handleRemovePolicy = useCallback(() => {
        vscode.postMessage({
            kind: "ChangeFieldValue",
            contextKey,
            fieldType: "MintingPolicyHash",
            fieldName: `policy-${n - 1}`,
            fieldValue: ""
        } satisfies ChangeFieldValueEvent)
    }, [vscode, contextKey, n])

    return (
        <>
            <h3>Policies</h3>

            {collectListItems(fields, "policy").map((fieldValue, i) => {
                const key = `policy-${i}`

                return (
                    <div key={key} className={styles.valueTokens}>
                        <h4>Policy {i}</h4>

                        <ArgInput
                            fieldName={key}
                            fieldType="MintingPolicyHash"
                            fieldValue={fieldValue}
                        />

                        <GenericMapForm
                            sectionTitle={<h4>Tokens {i}</h4>}
                            schema={INNER_SCHEMA}
                            fields={fields}
                            keyPrefix={`token-name-${i}`}
                            valuePrefix={`quantity-${i}`}
                        />
                    </div>
                )
            })}

            <div className={styles.actions}>
                <IconButton onClick={handleAddPolicy}>
                    <ThickPlusIcon />
                </IconButton>

                <IconButton
                    onClick={handleRemovePolicy}
                    disabled={n == 0}
                    tooltip={n == 0 ? "Already empty" : undefined}
                >
                    <ThickMinusIcon />
                </IconButton>
            </div>
        </>
    )
}
