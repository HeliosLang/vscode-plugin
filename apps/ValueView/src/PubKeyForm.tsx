import { ByteArrayLikeInput } from "components"

type PubKeyFormProps = {
    fields: Record<string, string>
}

export function PubKeyForm({ fields }: PubKeyFormProps) {
    const extraValidation = (value: string) => {
        if (value.length != 32) {
            return "Not 32 bytes"
        } else {
            return ""
        }
    }

    return (
        <>
            <h3>PubKey</h3>
            <ByteArrayLikeInput
                fieldName="value"
                fieldType="PubKey"
                extraValidation={extraValidation}
                fieldValue={fields["value"]}
            />
        </>
    )
}
