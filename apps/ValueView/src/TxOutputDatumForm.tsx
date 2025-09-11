import { BuiltinEnumForm } from "./BuiltinEnumForm"
import { TX_OUTPUT_DATUM_VARIANTS } from "schemas"

type TxOutputDatumFormProps = {
    fields: Record<string, string>
}

export function TxOutputDatumForm({ fields }: TxOutputDatumFormProps) {
    return (
        <BuiltinEnumForm
            variants={TX_OUTPUT_DATUM_VARIANTS}
            defaultVariant="None"
            fields={fields}
        />
    )
}
