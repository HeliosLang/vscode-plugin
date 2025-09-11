import { ByteArrayLikeInput } from "components"

type StakingValidatorHashFormProps = {
    fields: Record<string, string>
}

export function StakingValidatorHashForm({
    fields
}: StakingValidatorHashFormProps) {
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
                fieldType="StakingValidatorHash"
                extraValidation={extraValidation}
                fieldValue={fields["value"]}
            />
        </>
    )
}
