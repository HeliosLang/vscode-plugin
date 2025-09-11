import { STAKING_HASH_VARIANTS } from "schemas"
import { BuiltinEnumForm } from "./BuiltinEnumForm"

type StakingHashFormProps = {
    fields: Record<string, string>
}

export function StakingHashForm({ fields }: StakingHashFormProps) {
    return (
        <BuiltinEnumForm
            variants={STAKING_HASH_VARIANTS}
            defaultVariant="StakeKey"
            fields={fields}
        />
    )
}
