import { ByteArrayLikeInput } from "components"

type MintingPolicyHashFormProps = {
    fields: Record<string, string>
}

export function MintingPolicyHashForm({ fields }: MintingPolicyHashFormProps) {
    const extraValidation = (value: string) => {
        if (value.length != 0 && value.length != 56) {
            return "Not 0 or 28 bytes" // TODO: separate MPH dropdown entry for ADA?
        } else {
            return ""
        }
    }

    return (
        <>
            <h3>Hash</h3>
            <ByteArrayLikeInput
                fieldName="value"
                fieldType="MintingPolicyHash"
                extraValidation={extraValidation}
                fieldValue={fields["value"]}
            />
        </>
    )
}
