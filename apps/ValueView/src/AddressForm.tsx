import { StructTypeSchema } from "@helios-lang/type-utils"
import { BuiltinStructForm } from "./BuiltinStructForm"

type AddressFormProps = {
    fields: Record<string, string>
}

const ADDRESS_SCHEMA: StructTypeSchema = {
    kind: "struct",
    id: "Address",
    name: "Address",
    format: "list",
    fieldTypes: [
        {
            name: "credential",
            type: {kind: "internal", name: "SpendingCredential"}
        },
        {
            name: "staking_credential",
            type: {
                kind: "option",
                someType: {
                    kind: "internal",
                    name: "StakingCredential"
                }
            }
        }
    ]
}

export function AddressForm({ fields }: AddressFormProps) {
    return <BuiltinStructForm schema={ADDRESS_SCHEMA} fields={fields} />
}
