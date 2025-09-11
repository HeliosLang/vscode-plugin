import { DCERT_VARIANTS } from "schemas"
import { BuiltinEnumForm } from "./BuiltinEnumForm"

type DCertFormProps = {
    fields: Record<string, string>
}

export function DCertForm({ fields }: DCertFormProps) {
    return (
        <BuiltinEnumForm
            variants={DCERT_VARIANTS}
            defaultVariant="PubKey"
            fields={fields}
        />
    )
}
