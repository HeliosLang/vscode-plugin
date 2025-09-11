import { SPENDING_CREDENTIAL_VARIANTS } from "schemas"
import { BuiltinEnumForm } from "./BuiltinEnumForm"

type SpendingCredentialFormProps = {
    fields: Record<string, string>
}

export function SpendingCredentialForm({
    fields
}: SpendingCredentialFormProps) {
    return (
        <BuiltinEnumForm
            variants={SPENDING_CREDENTIAL_VARIANTS}
            defaultVariant="PubKey"
            fields={fields}
        />
    )
}
