import { ChangeEvent, ReactNode, useCallback, useMemo, useState } from "react"
import { bytesToHex } from "@helios-lang/codec-utils"
import { makeListData } from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { isValidBool, parseBoolData } from "./BoolInput"
import { ValidatedInput } from "./ValidatedInput"
import { useListData } from "./useListData"
import { useUplcData } from "./useUplcData"

type BoolListInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "[]Bool"

export function BoolListInput({
    fieldName,
    fieldValue,
    label
}: BoolListInputProps) {
    const initialListValue = useListData(useUplcData(fieldValue))

    const initialBoolListValue = useMemo(() => {
        if (!initialListValue) {
            return undefined
        }

        const bools: ("false" | "true")[] = []

        for (let entry of initialListValue.items) {
            if (entry.kind == "constr") {
                bools.push(entry.tag != 0 ? "true" : "false")
            } else {
                return undefined
            }
        }

        return bools
    }, [initialListValue])

    const [value, setValue] = useState(
        initialBoolListValue !== undefined
            ? initialBoolListValue.join(", ")
            : "0, false, 1, true"
    )
    const changeValue = useChangeFieldValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            const newValue = evt.target.value
            setValue(newValue)

            if (isValidBoolList(newValue)) {
                const dataHex = bytesToHex(
                    makeListData(
                        newValue.trim() != ""
                            ? newValue.split(",").map(parseBoolData)
                            : []
                    ).toCbor()
                )

                changeValue({
                    fieldName: fieldName,
                    fieldType: TYPE_NAME,
                    fieldValue: dataHex
                })
            }
        },
        [setValue, changeValue, fieldName]
    )

    const error = validateBoolList(value)

    return (
        <>
            {label || <ArgLabel name={fieldName} type={TYPE_NAME} />}
            <ValidatedInput
                value={value}
                onChange={handleChange}
                error={error}
            />
        </>
    )
}

function isValidBoolList(value: string): boolean {
    return validateBoolList(value) == ""
}

function validateBoolList(value: string): string {
    const trimmed = value.trim()

    if (trimmed == "") {
        // empty is fine
        return ""
    }

    if (trimmed.startsWith(",")) {
        return "Leading comma"
    }

    if (trimmed.endsWith(",")) {
        return "Trailing comma"
    }

    const parts = trimmed.split(",")

    for (let i = 0; i < parts.length; i++) {
        const p = parts[i]

        if (!isValidBool(p)) {
            return `Invalid boolean at position ${i}`
        }
    }

    return ""
}
