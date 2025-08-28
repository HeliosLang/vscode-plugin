import { ChangeEvent, useCallback, useMemo, useState } from "react"
import { bytesToHex } from "@helios-lang/codec-utils"
import {
    decodeUplcData,
    makeIntData,
    makeListData,
    UplcData
} from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { ValidatedInput } from "./ValidatedInput"
import { isValidInt } from "./IntInput"

type RatioInputProps = {
    fieldName: string
    fieldValue: string
}

const TYPE_NAME = "Ratio"

export function RatioInput({ fieldName, fieldValue }: RatioInputProps) {
    const initialRatioValue: [bigint, bigint] | undefined = useMemo(() => {
        return unpackRatioData(decodeUplcData(fieldValue))
    }, [fieldValue])

    const [value, setValue] = useState(
        initialRatioValue
            ? `${initialRatioValue[0].toString()}/${initialRatioValue[1].toString()}`
            : "2/3"
    ) // can be invalid
    const changeValue = useChangeFieldValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            const newValue = evt.target.value
            setValue(newValue)

            if (isValidRatio(newValue)) {
                const dataHex: string = bytesToHex(
                    parseRatioData(newValue).toCbor()
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

    const error = validateRatio(value)

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

export function unpackRatioData(
    data: UplcData | undefined
): [bigint, bigint] | undefined {
    if (data?.kind == "list" && data.items.length == 2) {
        const [a, b] = data.list

        if (a?.kind == "int" && b?.kind == "int") {
            return [a.value, b.value]
        }
    }

    return undefined
}

/**
 * Throws an error if not valid
 * @param value
 */
export function parseRatioData(value: string): UplcData {
    const [rt, rb] = value.split("/")

    let t = BigInt(rt)
    let b = BigInt(rb)

    if (b < 0n) {
        t *= -1n
        b *= -1n
    }

    return makeListData([makeIntData(BigInt(t)), makeIntData(BigInt(b))])
}

export function isValidRatio(value: string): boolean {
    return validateRatio(value) == ""
}

function validateRatio(value: string): string {
    const trimmed = value.trim()

    if (trimmed == "") {
        return "Empty"
    }

    const parts = trimmed.split("/")

    if (parts.length == 1) {
        return "Missing '/'"
    }

    if (parts.length > 2) {
        return "Too many '/'"
    }

    const trimmedTop = parts[0].trim()

    if (trimmedTop == "") {
        return "Empty numerator"
    }

    if (!isValidInt(trimmedTop)) {
        return "Invalid numerator format"
    }

    const trimmedBottom = parts[1].trim()

    if (trimmedBottom == "") {
        return "Empty denominator"
    }

    if (!isValidInt(trimmedBottom)) {
        return "Invalid denominator format"
    }

    return ""
}
