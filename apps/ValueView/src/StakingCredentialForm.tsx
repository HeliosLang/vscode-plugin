import { StructTypeSchema } from "@helios-lang/type-utils"
import { BuiltinStructForm } from "./BuiltinStructForm"

type StakingCredentialFormProps = {
    fields: Record<string, string>
}

const SCHEMA: StructTypeSchema = {
    kind: "struct",
    id: "StakingCredential",
    name: "StakingCredential",
    format: "list", // doesn't matter
    fieldTypes: [
        {
            name: "hash",
            type: {kind: "internal", name: "StakingHash"}
        }
    ]
}

export function StakingCredentialForm({ fields }: StakingCredentialFormProps) {
    return <BuiltinStructForm schema={SCHEMA} fields={fields} />
}
