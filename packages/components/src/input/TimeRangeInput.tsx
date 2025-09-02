import { ReactNode, useCallback, useMemo } from "react"
import { useContextKey, usePanelContext, useStoreHelper } from "../context"
import { DEFAULT_VALUE_NAME, makeCreateMessage, useCurrentGenericInputValue, useSelectGenericValue } from "./GenericInput"
import { bytesToHex } from "@helios-lang/codec-utils"
import { makeTimeRange } from "@helios-lang/ledger"
import { EditValueEvent } from "schemas"
import { useVsCodeApi } from "../vscode"
import { ArgLabel } from "./ArgLabel"

import styles from "./styles.module.css"
import { Select } from "./Select"
import { IconButton } from "./IconButton"
import { PencilIcon } from "../icons/PencilIcon"
import { useChangeFieldValue } from "../events"

type TimeRangeInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "TimeRange"

const ALWAYS_VALUE = bytesToHex(makeTimeRange(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY).toUplcData().toCbor())
const NEVER_VALUE = bytesToHex(makeTimeRange(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY).toUplcData().toCbor())

export function TimeRangeInput({fieldName, fieldValue, label}: TimeRangeInputProps) {
    const vscode = useVsCodeApi()
    const store = useStoreHelper()
    const contextKey = useContextKey()
    const selectGenericValue = useSelectGenericValue(fieldName, TYPE_NAME)
    const changeValue = useChangeFieldValue()
    
    const options = useMemo(() => {
        const userOptions = store.getTypeOptions(TYPE_NAME)
        return userOptions.concat(["ALWAYS", "NEVER", makeCreateMessage(TYPE_NAME)])
    }, [store])

    const valueName = useCurrentTimeRange(
        fieldName, fieldValue
    )

    const handleSelect = useCallback((newValueName: string) => {
        if (newValueName == "ALWAYS") {
            changeValue({
                fieldName,
                fieldType: TYPE_NAME,
                fieldValue: ALWAYS_VALUE
            })
        } else if (newValueName == "NEVER") {
            changeValue({
                fieldName,
                fieldType: TYPE_NAME,
                fieldValue: NEVER_VALUE
            })
        } else {
            selectGenericValue(newValueName)
        }
    }, [vscode, fieldName, selectGenericValue])

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
                    disabled={valueName == "ALWAYS" || valueName == "NEVER"}
                    tooltip={(valueName == "ALWAYS" || valueName == "NEVER") ? `Can't edit ${valueName}` : undefined}
                >
                    <PencilIcon />
                </IconButton>
            </div>
        </>
    )
}

function useCurrentTimeRange(
    fieldName: string,
    fieldValue: string
): string {
    const context = usePanelContext()
    const valueName = useCurrentGenericInputValue(fieldName, TYPE_NAME, fieldValue)

    return useMemo(() => {
        if (valueName != DEFAULT_VALUE_NAME) {
            return valueName
        }

        if (fieldValue == NEVER_VALUE) {
            return "NEVER"
        } else {
            return "ALWAYS"
        }
    }, [context, valueName, fieldValue])

}