import { ChangeEvent, ReactNode, useCallback, useMemo, useState } from "react"
import { bytesToHex } from "@helios-lang/codec-utils"
import { makeIntData, UplcData } from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { ValidatedInput } from "./ValidatedInput"
import { useUplcData } from "./useUplcData"

type RealInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "Real"
const DEFAULT_VALUE = "3.141592"

export function RealInput({ fieldName, fieldValue, label }: RealInputProps) {
    const data = useUplcData(fieldValue)

    const initialRealValue = useMemo(() => {
        if (data?.kind == "int") {
            return Number(data.value) / 1_000_000
        } else {
            return undefined
        }
    }, [data])

    const [value, setValue] = useState(
        initialRealValue ? initialRealValue.toString() : DEFAULT_VALUE
    )
    const changeValue = useChangeFieldValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            const newValue = evt.target.value

            setValue(newValue)

            if (isValidReal(newValue)) {
                const dataHex = bytesToHex(parseRealData(newValue).toCbor())
                changeValue({
                    fieldName: fieldName,
                    fieldType: TYPE_NAME,
                    fieldValue: dataHex
                })
            }
        },
        [setValue, changeValue, fieldName]
    )

    const error = validateReal(value)

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

/**
 * Throws an error if not valid
 * @param value
 */
export function parseRealData(value: string): UplcData {
    return makeIntData(Math.round(parseFloat(value) * 1_000_000))
}

export function isValidReal(value: string): boolean {
    return validateReal(value) == ""
}

function validateReal(value: string): string {
    const trimmed = value.trim()

    if (trimmed == "") {
        return "Empty"
    }

    if (
        Number.isNaN(parseFloat(trimmed)) ||
        parseFloat(trimmed).toString() != trimmed
    ) {
        return "Invalid format"
    }

    return ""
}
