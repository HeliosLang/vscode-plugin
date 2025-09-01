import { ReactNode, useCallback, useMemo } from "react"
import { useContextKey, usePanelContext, useStoreHelper } from "../context"
import { DEFAULT_VALUE_NAME, makeCreateMessage, useCurrentGenericInputValue, useSelectGenericValue } from "./GenericInput"
import { bytesToHex } from "@helios-lang/codec-utils"
import { EditValueEvent, genDummyHash } from "schemas"
import { makeByteArrayData } from "@helios-lang/uplc"
import { useVsCodeApi } from "../vscode"
import { ArgLabel } from "./ArgLabel"

import styles from "./styles.module.css"
import { Select } from "./Select"
import { IconButton } from "./IconButton"
import { PencilIcon } from "../icons/PencilIcon"
import { useChangeFieldValue } from "../events"

type MintingPolicyHashInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "MintingPolicyHash"
const PURPOSES = ["mixed", "minting"]

// similar to generic select, but includes known validators
export function MintingPolicyHashInput({fieldName, fieldValue, label}: MintingPolicyHashInputProps) {
    const vscode = useVsCodeApi()
    const store = useStoreHelper()
    const contextKey = useContextKey()
    const validatorOptions = useMintingPolicyHashOptions()
    const selectGenericValue = useSelectGenericValue(fieldName, TYPE_NAME)
    const changeValue = useChangeFieldValue()
    
    const options = useMemo(() => {
        const userOptions = store.getTypeOptions(TYPE_NAME)
        
        return userOptions.concat(validatorOptions).concat(["NIL", makeCreateMessage(TYPE_NAME)])
    }, [store, validatorOptions])

    const valueName = useCurrentMintingPolicyHash(
        fieldName, fieldValue, validatorOptions
    )

    const handleSelect = useCallback((newValueName: string) => {
        if (validatorOptions.includes(newValueName)) {
            changeValue({
                fieldName, 
                fieldType: TYPE_NAME, 
                fieldValue: bytesToHex(makeByteArrayData(genDummyHash(newValueName)).toCbor())
            })
        } else {
            selectGenericValue(newValueName)
        }
    }, [vscode, validatorOptions, selectGenericValue])

    const handleEdit = useCallback(() => {
        if (valueName) {
            vscode.postMessage({
                kind: "EditValue",
                typeName: TYPE_NAME,
                valueName,
                callerContextKey: contextKey,
                callerFieldName: fieldName
            } satisfies EditValueEvent)
        }
    }, [vscode, valueName, contextKey, fieldName])

    return (
        <>
            {label || <ArgLabel name={fieldName} type={TYPE_NAME} />}
            <div className={styles.genericInputRow}>
                <Select
                    value={valueName}
                    className={styles.notFullWidth}
                    options={options}
                    onChange={handleSelect}
                />

                <IconButton
                    onClick={handleEdit}
                    disabled={valueName == DEFAULT_VALUE_NAME || validatorOptions.includes(valueName)}
                    tooltip={valueName == DEFAULT_VALUE_NAME ? `Can't edit ${DEFAULT_VALUE_NAME}` : validatorOptions.includes(valueName) ? `Can't edit validator hash` : undefined}
                >
                    <PencilIcon />
                </IconButton>
            </div>
        </>
    )
}

function useValidatorOptions(purposes: string[]): string[] {
    const context = usePanelContext()

    return useMemo(() => {
        return context.kind == "PanelLoading" ? [] : context.allValidators.filter(v => purposes.includes(v.purpose)).map(v => v.name)
    }, [context, purposes])
}

function useMintingPolicyHashOptions(): string[] {
    return useValidatorOptions(PURPOSES)
}

function useCurrentMintingPolicyHash(
    fieldName: string,
    fieldValue: string,
    validatorOptions: string[]
): string {
    const context = usePanelContext()
    const valueName = useCurrentGenericInputValue(fieldName, TYPE_NAME, fieldValue)

    return useMemo(() => {
        if (valueName != DEFAULT_VALUE_NAME) {
            return valueName
        }

        for (let validatorName of validatorOptions) {
            if (bytesToHex(makeByteArrayData(genDummyHash(validatorName)).toCbor()) == fieldValue) {
                return validatorName
            }
        }

        return valueName
    }, [context, valueName, fieldValue, validatorOptions])

}