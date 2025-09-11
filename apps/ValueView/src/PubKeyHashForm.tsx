import { ByteArrayLikeInput } from "components"

type PubKeyHashFormProps = {
    fields: Record<string, string>
}

export function PubKeyHashForm({ fields }: PubKeyHashFormProps) {
    const extraValidation = (value: string) => {
        if (value.length != 56) {
            return "Not 28 bytes"
        } else {
            return ""
        }
    }

    return (
        <>
            <h3>Hash</h3>
            <ByteArrayLikeInput
                fieldName="value"
                fieldType="PubKeyHash"
                extraValidation={extraValidation}
                fieldValue={fields["value"]}
            />
        </>
    )
}
