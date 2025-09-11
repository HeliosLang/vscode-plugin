import { ChangeEvent, ReactNode, useCallback, useMemo, useState } from "react"
import { bytesToHex, isValidHex } from "@helios-lang/codec-utils"
import { makeByteArrayData, UplcData } from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { ValidatedInput } from "./ValidatedInput"
import { useUplcData } from "./useUplcData"

type ByteArrayLikeInputProps = {
    fieldName: string
    fieldType: string
    fieldValue: string
    extraValidation?: (value: string) => string // extra validation function
    label?: ReactNode
}

export function ByteArrayLikeInput({
    fieldName,
    fieldType,
    fieldValue,
    extraValidation,
    label
}: ByteArrayLikeInputProps) {
    const data = useUplcData(fieldValue)

    const initialBytesValue = useMemo(() => {
        if (data?.kind == "bytes") {
            return bytesToHex(data.bytes)
        } else {
            return undefined
        }
    }, [data])

    const [value, setValue] = useState(
        initialBytesValue !== undefined ? initialBytesValue : "DEADBEEF"
    )
    const changeValue = useChangeFieldValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            const newValue = evt.target.value

            setValue(newValue)

            if (
                isValidByteArray(newValue) &&
                (!extraValidation || extraValidation(newValue) == "")
            ) {
                const dataHex = bytesToHex(makeByteArrayData(newValue).toCbor())

                changeValue({
                    fieldName,
                    fieldType,
                    fieldValue: dataHex
                })
            }
        },
        [fieldName, fieldType, setValue, extraValidation, changeValue]
    )

    const error = extraValidation
        ? extraValidation(value)
        : validateByteArray(value)

    return (
        <>
            {label || <ArgLabel name={fieldName} type={fieldType} />}
            <ValidatedInput
                value={value}
                onChange={handleChange}
                error={error}
            />
        </>
    )
}

export function parseByteArrayData(value: string): UplcData {
    if (value.startsWith("0x")) {
        value = value.slice(2)
    } else if (value.startsWith("#")) {
        value = value.slice(1)
    }

    return makeByteArrayData(value)
}

export function isValidByteArray(value: string): boolean {
    return validateByteArray(value) == ""
}

function validateByteArray(value: string): string {
    const trimmed = value.trim()

    if (trimmed.length == 0) {
        return ""
    }

    const cleaned = trimmed.startsWith("#")
        ? trimmed.slice(1)
        : trimmed.startsWith("0x")
          ? trimmed.slice(2)
          : trimmed

    if (cleaned == "") {
        return ""
    }

    if (!cleaned.match(/^[0-9A-Fa-f]+$/)) {
        return "Invalid format"
    }

    if (!isValidHex(cleaned)) {
        return "Invalid format"
    }

    if (cleaned.length % 2 != 0) {
        return "Uneven"
    }

    return ""
}
