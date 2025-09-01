import { ChangeEvent, ReactNode, useCallback, useMemo, useState } from "react"
import { bytesToHex } from "@helios-lang/codec-utils"
import { makeListData } from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { isValidInt, parseIntData } from "./IntLikeInput"
import { ValidatedInput } from "./ValidatedInput"
import { useListData } from "./useListData"
import { useUplcData } from "./useUplcData"

type IntListInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "[]Int"

export function IntListInput({ fieldName, fieldValue, label }: IntListInputProps) {
    const initialListValue = useListData(useUplcData(fieldValue))

    const initialIntListValue = useMemo(() => {
        if (!initialListValue) {
            return undefined
        }

        const result: string[] = []

        for (let entry of initialListValue.items) {
            if (entry.kind == "int") {
                result.push(entry.value.toString())
            } else {
                return undefined
            }
        }

        return result
    }, [initialListValue])

    const [value, setValue] = useState(
        initialIntListValue !== undefined
            ? initialIntListValue.join(", ")
            : "0, 1, 2, 3"
    )
    const changeValue = useChangeFieldValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            const newValue = evt.target.value
            setValue(newValue)

            if (isValidIntList(newValue)) {
                const dataHex = bytesToHex(
                    makeListData(
                        newValue.trim() != ""
                            ? newValue.split(",").map(parseIntData)
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

    const error = validateIntList(value)

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

function isValidIntList(value: string): boolean {
    return validateIntList(value) == ""
}

function validateIntList(value: string): string {
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

        if (!isValidInt(p)) {
            return `Invalid integer at position ${i}`
        }
    }

    return ""
}
