import { ChangeEvent, useCallback, useMemo, useState } from "react"
import { bytesToHex } from "@helios-lang/codec-utils"
import { makeListData } from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { ValidatedInput } from "./ValidatedInput"
import { isValidByteArray, parseByteArrayData } from "./ByteArrayInput"
import { useListData } from "./useListData"
import { useUplcData } from "./useUplcData"

type ByteArrayListInputProps = {
    fieldName: string
    fieldValue: string
}

const TYPE_NAME = "[]ByteArray"

export function ByteArrayListInput({
    fieldName,
    fieldValue
}: ByteArrayListInputProps) {
    const initialListValue = useListData(useUplcData(fieldValue))

    const initialBytesList = useMemo(() => {
        if (!initialListValue) {
            return undefined
        }

        const result: string[] = []

        for (let entry of initialListValue.items) {
            if (entry.kind == "bytes") {
                result.push(`#${bytesToHex(entry.bytes)}`)
            } else {
                return undefined
            }
        }

        return result
    }, [initialListValue])

    const [value, setValue] = useState(
        initialBytesList !== undefined
            ? initialBytesList.join(", ")
            : "#00, #01, #02, #03"
    )
    const changeValue = useChangeFieldValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            const newValue = evt.target.value

            setValue(newValue)

            if (isValidByteArrayList(newValue)) {
                const dataHex = bytesToHex(
                    makeListData(
                        newValue.trim() != ""
                            ? newValue.split(",").map(parseByteArrayData)
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

    const error = validateByteArrayList(value)

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

function isValidByteArrayList(value: string): boolean {
    return validateByteArrayList(value) == ""
}

function validateByteArrayList(value: string): string {
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
        const p = parts[i].trim()

        if (!p.startsWith("#") && !p.startsWith("0x")) {
            return `Missing prefix at position ${i}`
        }

        if (!isValidByteArray(p)) {
            return `Invalid byte array at position ${i}`
        }
    }

    return ""
}
