import { StructTypeSchema } from "@helios-lang/type-utils"
import { BuiltinStructForm } from "./BuiltinStructForm"

type TxOutputFormProps = {
    fields: Record<string, string>
}

const SCHEMA: StructTypeSchema = {
    kind: "struct",
    id: "TxOutput",
    name: "TxOutput",
    format: "list",
    fieldTypes: [
        {
            name: "address",
            type: {kind: "internal", name: "Address"}
        },
        {
            name: "value",
            type: {kind: "internal", name: "Value"}
        },
        {
            name: "datum",
            type: {kind: "internal", name: "TxOutputDatum"}
        },
        {
            name: "ref_script",
            type: {
                kind: "option",
                someType: {
                    kind: "internal", name: "ScriptHash"
                }
            }
        }
    ]
}

export function TxOutputForm({ fields }: TxOutputFormProps) {    
    return <BuiltinStructForm schema={SCHEMA} fields={fields} />
}
