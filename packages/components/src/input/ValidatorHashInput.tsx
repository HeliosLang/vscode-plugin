import { ReactNode } from "react"
import { ScriptHashLikeInput, useValidatorOptions } from "./ScriptHashLikeInput"

type ValidatorHashInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "ValidatorHash"
const PURPOSES = ["mixed", "spending"]

export function ValidatorHashInput({
    fieldName,
    fieldValue,
    label
}: ValidatorHashInputProps) {
    const options = useValidatorHashOptions()

    return (
        <>
            <ScriptHashLikeInput
                validatorOptions={options}
                fieldName={fieldName}
                fieldValue={fieldValue}
                typeName={TYPE_NAME}
                label={label}
            />
        </>
    )
}

function useValidatorHashOptions(): string[] {
    return useValidatorOptions(PURPOSES)
}
