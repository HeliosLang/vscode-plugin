import { useCallback, useMemo, useState } from "react"
import { bytesToHex } from "@helios-lang/codec-utils"
import { decodeUplcData, makeConstrData, UplcData } from "@helios-lang/uplc"
import { useChangeFieldValue } from "../events"
import { ArgLabel } from "./ArgLabel"
import { Select } from "./Select"

type BoolInputProps = {
    fieldName: string
    fieldValue: string
}

const OPTIONS = ["true", "false"]
const TYPE_NAME = "Bool"

export function BoolInput({ fieldName, fieldValue }: BoolInputProps) {
    const initialBoolValue: string = useMemo(() => {
        if (!fieldValue) {
            return "true"
        }

        try {
            const data = decodeUplcData(fieldValue)
            if (data?.kind == "constr") {
                return data.tag != 0 ? "true" : "false"
            }
        } catch (_) {}

        return "true"
    }, [fieldValue])

    const changeValue = useChangeFieldValue()

    const [value, setValue] = useState(initialBoolValue)

    const handleChange = useCallback(
        (newValue: string) => {
            setValue(newValue)

            try {
                const dataHex = bytesToHex(parseBoolData(newValue).toCbor())

                changeValue({
                    fieldName,
                    fieldType: TYPE_NAME,
                    fieldValue: dataHex
                })
            } catch (_) {}
        },
        [changeValue, fieldName, setValue]
    )

    return (
        <>
            <ArgLabel name={fieldName} type={TYPE_NAME} />
            <Select options={OPTIONS} onChange={handleChange} value={value} />
        </>
    )
}

export function parseBoolData(value: string): UplcData {
    const cleaned = value.trim().toLowerCase()

    if (["true", "1"].includes(cleaned)) {
        return makeConstrData(1, [])
    } else if (["false", "0"].includes(cleaned)) {
        return makeConstrData(0, [])
    } else {
        throw new Error("Invalid bool format")
    }
}

export function isValidBool(value: string): boolean {
    return validateBool(value) == ""
}

function validateBool(value: string): string {
    const trimmed = value.trim()

    if (trimmed == "") {
        return "Empty"
    }

    const cleaned = trimmed.toLowerCase()

    if (!["true", "1", "false", "0"].includes(cleaned)) {
        return "Invalid format"
    }

    return ""
}
