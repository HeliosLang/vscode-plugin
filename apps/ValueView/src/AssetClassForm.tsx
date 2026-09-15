import { StructTypeSchema } from "@helios-lang/type-utils"
import { BuiltinStructForm } from "./BuiltinStructForm"

type AssetClassFormProps = {
    fields: Record<string, string>
}

const ASSETCLASS_SCHEMA: StructTypeSchema = {
    kind: "struct",
    id: "AssetClass",
    name: "AssetClass",
    format: "list",
    fieldTypes: [
        {
            name: "mph",
            type: { kind: "internal", name: "MintingPolicyHash" }
        },
        {
            name: "token_name",
            type: { kind: "internal", name: "ByteArray" }
        }
    ]
}

export function AssetClassForm({ fields }: AssetClassFormProps) {
    return <BuiltinStructForm schema={ASSETCLASS_SCHEMA} fields={fields} />
}
