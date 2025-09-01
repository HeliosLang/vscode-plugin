import { ArgInput } from "components"

type ScriptContextInputProps = {
    fields: Record<string, string>
}

export function ScriptContextInput({ fields }: ScriptContextInputProps) {    
    return (
        <>
            <h3>Tx</h3>
            <ArgInput
                fieldName="tx"
                fieldType="Tx"
                fieldValue={fields["tx"]}
            />

            <h3>Purpose</h3>
            <ArgInput
                fieldName="purpose"
                fieldType="ScriptPurpose"
                fieldValue={fields["purpose"]}
            />
        </>
    )
}
