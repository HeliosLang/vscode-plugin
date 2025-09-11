import { ByteArrayLikeInput } from "components"

type ScriptHashFormProps = {
    fields: Record<string, string>
}

export function ScriptHashForm({ fields }: ScriptHashFormProps) {
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
                fieldType="ScriptHash"
                extraValidation={extraValidation}
                fieldValue={fields["value"]}
            />
        </>
    )
}
