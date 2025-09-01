import { IntLikeInput } from "./IntLikeInput"

type IntInputProps = {
    fieldName: string
    fieldValue: string
}

export function IntInput({ fieldName, fieldValue }: IntInputProps) {
    return <IntLikeInput typeName="Int" fieldName={fieldName} fieldValue={fieldValue} />
}
