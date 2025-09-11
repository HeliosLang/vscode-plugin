import { SCRIPT_PURPOSE_VARIANTS } from "schemas"
import { BuiltinEnumForm } from "./BuiltinEnumForm"

type ScriptPurposeFormProps = {
    fields: Record<string, string>
}

export function ScriptPurposeForm({ fields }: ScriptPurposeFormProps) {
    return (
        <BuiltinEnumForm
            variants={SCRIPT_PURPOSE_VARIANTS}
            defaultVariant="Minting"
            fields={fields}
        />
    )
}
