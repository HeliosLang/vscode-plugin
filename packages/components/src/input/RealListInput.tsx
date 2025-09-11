import { ChangeEvent, ReactNode, useCallback, useMemo, useState } from "react"
import { bytesToHex } from "@helios-lang/codec-utils"
import { makeListData } from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { isValidReal, parseRealData } from "./RealInput"
import { ValidatedInput } from "./ValidatedInput"
import { useListData } from "./useListData"
import { useUplcData } from "./useUplcData"

type RealListInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "[]Real"

export function RealListInput({
    fieldName,
    fieldValue,
    label
}: RealListInputProps) {
    const initialListValue = useListData(useUplcData(fieldValue))

    const initialRealListValue = useMemo(() => {
        if (!initialListValue) {
            return undefined
        }

        const result: string[] = []

        for (let entry of initialListValue.items) {
            if (entry.kind == "int") {
                result.push((Number(entry.value) / 1000000).toString())
            } else {
                return undefined
            }
        }

        return result
    }, [initialListValue])

    const [value, setValue] = useState(
        initialRealListValue !== undefined
            ? initialRealListValue.join(", ")
            : "0.0, 0.1, 0.2, 0.3"
    )
    const changeValue = useChangeFieldValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            const newValue = evt.target.value

            setValue(newValue)

            if (isValidRealList(newValue)) {
                const dataHex = bytesToHex(
                    makeListData(
                        newValue.trim() != ""
                            ? newValue.split(",").map(parseRealData)
                            : []
                    ).toCbor()
                )
                changeValue({
                    fieldName,
                    fieldType: TYPE_NAME,
                    fieldValue: dataHex
                })
            }
        },
        [setValue, changeValue, fieldName]
    )

    const error = validateRealList(value)

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

function isValidRealList(value: string): boolean {
    return validateRealList(value) == ""
}

function validateRealList(value: string): string {
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

        if (!isValidReal(p)) {
            return `Invalid number at position ${i}`
        }
    }

    return ""
}
