import { ByteArrayLikeInput } from "components"

type ValidatorHashFormProps = {
    fields: Record<string, string>
}

export function ValidatorHashForm({ fields }: ValidatorHashFormProps) {    
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
                fieldType="ValidatorHash"
                extraValidation={extraValidation}
                fieldValue={fields["value"]}
            />
        </>
    )
}
