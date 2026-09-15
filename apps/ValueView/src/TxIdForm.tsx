import { ByteArrayLikeInput } from "components"

type TxIdFormProps = {
    fields: Record<string, string>
}

export function TxIdForm({ fields }: TxIdFormProps) {
    const extraValidation = (value: string) => {
        if (value.length != 64) {
            return "Not 32 bytes"
        } else {
            return ""
        }
    }

    return (
        <>
            <h3>TxId</h3>
            <ByteArrayLikeInput
                fieldName="value"
                fieldType="TxId"
                extraValidation={extraValidation}
                fieldValue={fields["value"]}
            />
        </>
    )
}
