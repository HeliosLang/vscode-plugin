import { ReactNode, useCallback } from "react"
import { ScriptHashLikeInput, useValidatorOptions } from "./ScriptHashLikeInput"
import { useChangeFieldValue } from "../events"
import { bytesToHex } from "@helios-lang/codec-utils"
import { makeByteArrayData } from "@helios-lang/uplc"

type MintingPolicyHashInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "MintingPolicyHash"
const PURPOSES = ["mixed", "minting"]

export function MintingPolicyHashInput({
    fieldName,
    fieldValue,
    label
}: MintingPolicyHashInputProps) {
    const options = useMintingPolicyHashOptions()
    const changeValue = useChangeFieldValue()

    const handleSelectADA = useCallback(
        (newName: string) => {
            if (newName == "ADA") {
                changeValue({
                    fieldName,
                    fieldType: TYPE_NAME,
                    fieldValue: bytesToHex(makeByteArrayData([]).toCbor())
                })
                return true
            } else {
                return false
            }
        },
        [changeValue, fieldName]
    )

    return (
        <ScriptHashLikeInput
            validatorOptions={options}
            fieldName={fieldName}
            fieldValue={fieldValue}
            typeName={TYPE_NAME}
            defaultName="ADA"
            onSelect={handleSelectADA}
            label={label}
        />
    )
}

function useMintingPolicyHashOptions(): string[] {
    return useValidatorOptions(PURPOSES)
}
