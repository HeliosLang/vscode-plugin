import { ChangeEvent, useCallback, useMemo, useState } from "react"
import { bytesToHex, decodeUtf8, encodeUtf8 } from "@helios-lang/codec-utils"
import { makeSource, makeTokenizer } from "@helios-lang/compiler-utils"
import { makeByteArrayData, makeListData } from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { ValidatedInput } from "./ValidatedInput"
import { useListData } from "./useListData"
import { useUplcData } from "./useUplcData"

type StringListInputProps = {
    fieldName: string
    fieldValue: string
}

const TYPE_NAME = "[]String"

export function StringListInput({
    fieldName,
    fieldValue
}: StringListInputProps) {
    const initialListValue = useListData(useUplcData(fieldValue))

    const initialStringListValue = useMemo(() => {
        if (!initialListValue) {
            return undefined
        }

        const result: string[] = []

        for (let entry of initialListValue.items) {
            if (entry.kind == "bytes") {
                try {
                    result.push(`"${decodeUtf8(entry.bytes)}"`)
                } catch (_) {
                    return undefined
                }
            } else {
                return undefined
            }
        }

        return result
    }, [initialListValue])

    const [value, setValue] = useState(
        initialStringListValue !== undefined
            ? initialStringListValue.join(", ")
            : '"a", "b", "c", "d"'
    )
    const changeValue = useChangeFieldValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            const newValue = evt.target.value

            setValue(newValue)

            let dataHex: string | undefined = undefined

            try {
                const items = tokenizeStringList(newValue)

                dataHex = bytesToHex(
                    makeListData(
                        items.map((item) => makeByteArrayData(encodeUtf8(item)))
                    ).toCbor()
                )
            } catch (_) {}

            if (dataHex) {
                changeValue({
                    fieldName: fieldName,
                    fieldType: TYPE_NAME,
                    fieldValue: dataHex
                })
            }
        },
        [setValue, changeValue, fieldName]
    )

    const error = validateStringList(value)

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

export function isValidStringList(value: string): boolean {
    return validateStringList(value) == ""
}

function tokenizeStringList(value: string): string[] {
    const tokenizer = makeTokenizer(makeSource(value))

    const tokens = tokenizer.tokenize(false)

    const result: string[] = []

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]

        if (i % 2 == 0) {
            if (t.kind != "string") {
                throw new Error(`Invalid string at position ${i}`)
            }

            result.push(t.value)
        } else {
            if (t.kind != "symbol" || t.value != ",") {
                throw new Error(`Expected comma at position ${i}`)
            }

            if (i == tokens.length - 1) {
                throw new Error("Trailing comma")
            }
        }
    }

    return result
}

function validateStringList(value: string): string {
    // here we must tokenize
    try {
        tokenizeStringList(value)
        return ""
    } catch (e) {
        return `Invalid format (${(e as Error).message})`
    }
}
