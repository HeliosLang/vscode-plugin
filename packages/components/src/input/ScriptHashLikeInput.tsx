import { ReactNode, useCallback, useMemo } from "react"
import { useContextKey, usePanelContext, useStoreHelper } from "../context"
import {
    DEFAULT_VALUE_NAME,
    makeCreateMessage,
    useCurrentGenericInputValue,
    useSelectGenericValue
} from "./GenericInput"
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

type ScriptHashLikeInputProps = {
    fieldName: string
    fieldValue: string
    validatorOptions: string[]
    typeName: string
    defaultName?: string // defaults to NIL, but is ADA for MintingPolicyHash
    onSelect?: (newName: string) => boolean
    label?: ReactNode
}

// similar to generic select, but includes known validators
// TODO: reuse this for ValidatorHashInput, StakingValidatorHashInput and ScriptHashInput
export function ScriptHashLikeInput({
    fieldName,
    fieldValue,
    typeName,
    defaultName = DEFAULT_VALUE_NAME,
    onSelect,
    validatorOptions,
    label
}: ScriptHashLikeInputProps) {
    const vscode = useVsCodeApi()
    const store = useStoreHelper()
    const contextKey = useContextKey()
    const selectGenericValue = useSelectGenericValue(fieldName, typeName)
    const changeValue = useChangeFieldValue()

    const options = useMemo(() => {
        const userOptions = store.getTypeOptions(typeName)
        return userOptions
            .concat(validatorOptions)
            .concat([defaultName, makeCreateMessage(typeName)])
    }, [store, validatorOptions, typeName, defaultName])

    const valueName = useCurrentValidatorOption(
        fieldName,
        fieldValue,
        typeName,
        defaultName,
        validatorOptions
    )

    const handleSelect = useCallback(
        (newValueName: string) => {
            if (onSelect && onSelect(newValueName)) {
                return
            } else if (validatorOptions.includes(newValueName)) {
                changeValue({
                    fieldName,
                    fieldType: typeName,
                    fieldValue: bytesToHex(
                        makeByteArrayData(genDummyHash(newValueName)).toCbor()
                    )
                })
            } else {
                selectGenericValue(newValueName)
            }
        },
        [
            vscode,
            fieldName,
            validatorOptions,
            selectGenericValue,
            typeName,
            onSelect
        ]
    )

    const handleEdit = useCallback(() => {
        if (valueName) {
            vscode.postMessage({
                kind: "EditValue",
                typeName: typeName,
                valueName,
                callerContextKey: contextKey,
                callerFieldName: fieldName
            } satisfies EditValueEvent)
        }
    }, [vscode, valueName, contextKey, fieldName, typeName])

    return (
        <>
            {label || <ArgLabel name={fieldName} type={typeName} />}
            <div className={styles.genericInputRow}>
                <Select
                    value={valueName}
                    className={styles.notFullWidth}
                    options={options}
                    onChange={handleSelect}
                />

                <IconButton
                    onClick={handleEdit}
                    disabled={
                        valueName == defaultName ||
                        validatorOptions.includes(valueName)
                    }
                    tooltip={
                        valueName == defaultName
                            ? `Can't edit ${defaultName}`
                            : validatorOptions.includes(valueName)
                              ? `Can't edit validator hash`
                              : undefined
                    }
                >
                    <PencilIcon />
                </IconButton>
            </div>
        </>
    )
}

export function useValidatorOptions(purposes: string[]): string[] {
    const context = usePanelContext()

    return useMemo(() => {
        return context.kind == "PanelLoading"
            ? []
            : context.allValidators
                  .filter((v) => purposes.includes(v.purpose))
                  .map((v) => v.name)
    }, [context, purposes])
}

function useCurrentValidatorOption(
    fieldName: string,
    fieldValue: string,
    typeName: string,
    defaultName: string,
    validatorOptions: string[]
): string {
    const context = usePanelContext()
    const valueName = useCurrentGenericInputValue(
        fieldName,
        typeName,
        fieldValue
    )

    return useMemo(() => {
        if (valueName != defaultName && valueName != DEFAULT_VALUE_NAME) {
            return valueName
        }

        if (defaultName != DEFAULT_VALUE_NAME && valueName == defaultName) {
            return valueName
        }

        for (let validatorName of validatorOptions) {
            if (
                bytesToHex(
                    makeByteArrayData(genDummyHash(validatorName)).toCbor()
                ) == fieldValue
            ) {
                return validatorName
            }
        }

        return defaultName
    }, [context, valueName, fieldValue, validatorOptions])
}
