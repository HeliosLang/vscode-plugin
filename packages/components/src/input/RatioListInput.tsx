import { ChangeEvent, useCallback, useMemo, useState } from "react"
import { bytesToHex } from "@helios-lang/codec-utils"
import { makeListData } from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { isValidRatio, parseRatioData, unpackRatioData } from "./RatioInput"
import { ValidatedInput } from "./ValidatedInput"
import { useListData } from "./useListData"
import { useUplcData } from "./useUplcData"

type RatioListInputProps = {
    fieldName: string
    fieldValue: string
}

const TYPE_NAME = "[]Ratio"

export function RatioListInput({ fieldName, fieldValue }: RatioListInputProps) {
    const initialListValue = useListData(useUplcData(fieldValue))

    const initialRatioListValue = useMemo(() => {
        if (!initialListValue) {
            return undefined
        }

        const result: string[] = []

        for (let entry of initialListValue.items) {
            const pair = unpackRatioData(entry)

            if (!pair) {
                return undefined
            }

            result.push(`${pair[0].toString()}/${pair[1].toString()}`)
        }

        return result
    }, [initialListValue])

    const [value, setValue] = useState(
        initialRatioListValue !== undefined
            ? initialRatioListValue.join(", ")
            : "1/4, 2/4, 3/4, 4/4"
    )
    const changeValue = useChangeFieldValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            const newValue = evt.target.value

            setValue(newValue)

            if (isValidRatioList(newValue)) {
                const dataHex = bytesToHex(
                    makeListData(
                        newValue.trim() != ""
                            ? newValue.split(",").map(parseRatioData)
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

    const error = validateRatioList(value)

    return (
        <>
            <ArgLabel name={fieldName} type={TYPE_NAME} />
            <ValidatedInput
                value={value}
                onChange={handleChange}
                error={error}
            />
        </>
    )
}

function isValidRatioList(value: string): boolean {
    return validateRatioList(value) == ""
}

function validateRatioList(value: string): string {
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

        if (!isValidRatio(p)) {
            return `Invalid ratio at position ${i}`
        }
    }

    return ""
}
