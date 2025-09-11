import { ReactNode } from "react"
import { ScriptHashLikeInput, useValidatorOptions } from "./ScriptHashLikeInput"

type StakingValidatorHashInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "StakingValidatorHash"
const PURPOSES = ["mixed", "staking"]

export function StakingValidatorHashInput({
    fieldName,
    fieldValue,
    label
}: StakingValidatorHashInputProps) {
    const options = useStakingValidatorHashOptions()

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

function useStakingValidatorHashOptions(): string[] {
    return useValidatorOptions(PURPOSES)
}
