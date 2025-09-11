import { ReactNode } from "react"
import { ScriptHashLikeInput, useValidatorOptions } from "./ScriptHashLikeInput"

type ScriptHashInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "ScriptHashHash"
const PURPOSES = ["mixed", "spending", "minting", "staking"]

export function ScriptHashInput({
    fieldName,
    fieldValue,
    label
}: ScriptHashInputProps) {
    const options = useScriptHashOptions()

    return (
        <ScriptHashLikeInput
            validatorOptions={options}
            fieldName={fieldName}
            fieldValue={fieldValue}
            typeName={TYPE_NAME}
            label={label}
        />
    )
}

function useScriptHashOptions(): string[] {
    return useValidatorOptions(PURPOSES)
}
