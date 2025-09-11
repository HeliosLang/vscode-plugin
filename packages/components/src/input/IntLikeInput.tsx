import { ChangeEvent, ReactNode, useCallback, useMemo, useState } from "react"
import { bytesToHex } from "@helios-lang/codec-utils"
import { makeIntData, UplcData } from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { ValidatedInput } from "./ValidatedInput"
import { useUplcData } from "./useUplcData"

type IntLikeInputProps = {
    fieldName: string
    typeName: "Duration" | "Int" | "Time"
    fieldValue: string
    label?: ReactNode
}

export function IntLikeInput({
    fieldName,
    fieldValue,
    typeName,
    label
}: IntLikeInputProps) {
    const data = useUplcData(fieldValue)

    const initialIntValue: bigint = useMemo(() => {
        if (data?.kind == "int") {
            return data.value
        } else {
            return 42n
        }
    }, [data])

    const [value, setValue] = useState(initialIntValue.toString())
    const changeValue = useChangeFieldValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            const newValue = evt.target.value
            setValue(newValue)

            if (isValidInt(newValue)) {
                const dataHex = bytesToHex(parseIntData(newValue).toCbor())
                changeValue({
                    fieldName,
                    fieldType: typeName,
                    fieldValue: dataHex
                })
            }
        },
        [setValue, fieldName, changeValue]
    )

    const error = validateInt(value)

    return (
        <>
            {label || <ArgLabel name={fieldName} type={typeName} />}
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
 * @returns
 */
export function parseIntData(value: string): UplcData {
    return makeIntData(BigInt(value))
}

export function isValidInt(value: string): boolean {
    return validateInt(value) == ""
}

export function validateInt(value: string): string {
    const trimmed = value.trim()

    if (trimmed == "") {
        return "Empty"
    }

    try {
        BigInt(trimmed)

        return ""
    } catch (_) {
        return "Invalid format"
    }
}
