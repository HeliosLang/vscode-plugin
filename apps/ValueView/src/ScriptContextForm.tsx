import { StructTypeSchema } from "@helios-lang/type-utils"
import { BuiltinStructForm } from "./BuiltinStructForm"

type ScriptContextFormProps = {
    fields: Record<string, string>
}

const SCHEMA: StructTypeSchema = {
    kind: "struct",
    name: "ScriptContext",
    id: "ScriptContext",
    format: "list",
    fieldTypes: [
        {
            name: "tx",
            type: {kind: "internal", name: "Tx"}
        },
        {
            name: "purpose",
            type: {kind: "internal", name: "ScriptPurpose"}
        }
    ]
}

export function ScriptContextForm({ fields }: ScriptContextFormProps) {    
    return <BuiltinStructForm schema={SCHEMA} fields={fields} />
}
