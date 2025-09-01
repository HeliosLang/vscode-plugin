import { StructTypeSchema } from "@helios-lang/type-utils"
import { BuiltinStructForm } from "./BuiltinStructForm"

type TxInputFormProps = {
    fields: Record<string, string>
}

const SCHEMA: StructTypeSchema = {
    kind: "struct",
    id: "TxInput",
    name: "TxInput",
    format: "list",
    fieldTypes: [
        {
            name: "output_id",
            type: {kind: "internal", name: "TxOutputId"}
        },
        {
            name: "output",
            type: {kind: "internal", name: "TxOutput"}
        }
    ]
}

export function TxInputForm({ fields }: TxInputFormProps) {    
    return <BuiltinStructForm schema={SCHEMA} fields={fields} />
}
