import { StructTypeSchema } from "@helios-lang/type-utils"
import { BuiltinStructForm } from "./BuiltinStructForm"

type TxOutputIdFormProps = {
    fields: Record<string, string>
}

const SCHEMA: StructTypeSchema = {
    kind: "struct",
    id: "TxOutputId",
    name: "TxOutputId",
    format: "list",
    fieldTypes: [
        {
            name: "tx_id",
            type: {kind: "internal", name: "TxId"}
        },
        {
            name: "index",
            type: {kind: "internal", name: "Int"}
        }
    ]
}

export function TxOutputIdForm({ fields }: TxOutputIdFormProps) {    
    return <BuiltinStructForm schema={SCHEMA} fields={fields} />
}
