import { ChangeEvent, useCallback, useMemo, useState } from "react"
import { bytesToHex, isValidHex } from "@helios-lang/codec-utils"
import { makeByteArrayData, UplcData } from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { ValidatedInput } from "./ValidatedInput"
import { useUplcData } from "./useUplcData"

type ByteArrayInputProps = {
    fieldName: string
    fieldValue: string
}

const TYPE_NAME = "ByteArray"

export function ByteArrayInput({ fieldName, fieldValue }: ByteArrayInputProps) {
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

            if (isValidByteArray(newValue)) {
                const dataHex = bytesToHex(
                    parseByteArrayData(newValue).toCbor()
                )
                changeValue({
                    fieldName,
                    fieldType: TYPE_NAME,
                    fieldValue: dataHex
                })
            }
        },
        [fieldName, setValue, changeValue]
    )

    const error = validateByteArray(value)

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

    const cleaned = trimmed.startsWith("#")
        ? trimmed.slice(1)
        : trimmed.startsWith("0x")
          ? trimmed.slice(2)
          : trimmed

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
