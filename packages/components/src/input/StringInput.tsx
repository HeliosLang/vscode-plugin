import { ChangeEvent, ReactNode, useCallback, useMemo, useState } from "react"
import { useChangeFieldValue } from "../events"
import { bytesToHex, decodeUtf8, encodeUtf8 } from "@helios-lang/codec-utils"
import { makeByteArrayData } from "@helios-lang/uplc"
import { ArgLabel } from "./ArgLabel"
import { ValidatedInput } from "./ValidatedInput"
import { useUplcData } from "./useUplcData"

type StringInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "String"

export function StringInput({
    fieldName,
    fieldValue,
    label
}: StringInputProps) {
    const data = useUplcData(fieldValue)

    const initialStringValue = useMemo(() => {
        if (data?.kind == "bytes") {
            try {
                return decodeUtf8(data.bytes)
            } catch (_) {
                return undefined
            }
        } else {
            return undefined
        }
    }, [data])

    const [value, setValue] = useState(
        initialStringValue !== undefined ? initialStringValue : "hello world"
    )
    const changeValue = useChangeFieldValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            const newValue = evt.target.value

            setValue(newValue)

            const dataHex = bytesToHex(
                makeByteArrayData(encodeUtf8(newValue)).toCbor()
            )

            changeValue({
                fieldName: fieldName,
                fieldType: TYPE_NAME,
                fieldValue: dataHex
            })
        },
        [fieldName, setValue, changeValue]
    )

    return (
        <>
            {label || <ArgLabel name={fieldName} type={TYPE_NAME} />}
            <ValidatedInput value={value} onChange={handleChange} error="" />
        </>
    )
}
