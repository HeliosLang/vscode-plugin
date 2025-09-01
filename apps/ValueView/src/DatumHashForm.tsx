import { ByteArrayLikeInput } from "components"

type DatumHashFormProps = {
    fields: Record<string, string>
}

export function DatumHashForm({ fields }: DatumHashFormProps) {    
    const extraValidation = (value: string) => {
        if (value.length != 64) {
            return "Not 32 bytes"
        } else {
            return ""
        }
    }

    return (
        <>
            <h3>Hash</h3>
            <ByteArrayLikeInput
                fieldName="value"
                fieldType="DatumHash"
                extraValidation={extraValidation}
                fieldValue={fields["value"]}
            />
        </>
    )
}
