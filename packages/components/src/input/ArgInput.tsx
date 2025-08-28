import { BoolInput } from "./BoolInput"
import { BoolListInput } from "./BoolListInput"
import { ByteArrayInput } from "./ByteArrayInput"
import { ByteArrayListInput } from "./ByteArrayListInput"
import { GenericInput } from "./GenericInput"
import { IntInput } from "./IntInput"
import { IntListInput } from "./IntListInput"
import { RatioInput } from "./RatioInput"
import { RatioListInput } from "./RatioListInput"
import { RealInput } from "./RealInput"
import { RealListInput } from "./RealListInput"
import { StringInput } from "./StringInput"
import { StringListInput } from "./StringListInput"

type ArgInputProps = {
    fieldName: string
    // eg. item-0

    fieldType: string
    // e.g. "Int", or "[]Int"

    fieldValue: string
    // cbor hex of UplcData
}

export function ArgInput({ fieldName, fieldType, fieldValue }: ArgInputProps) {
    switch (fieldType) {
        case "Bool":
            return <BoolInput fieldName={fieldName} fieldValue={fieldValue} />
        case "ByteArray":
            return (
                <ByteArrayInput fieldName={fieldName} fieldValue={fieldValue} />
            )
        case "Int":
            return <IntInput fieldName={fieldName} fieldValue={fieldValue} />
        case "Ratio":
            return <RatioInput fieldName={fieldName} fieldValue={fieldValue} />
        case "Real":
            return <RealInput fieldName={fieldName} fieldValue={fieldValue} />
        case "String":
            return <StringInput fieldName={fieldName} fieldValue={fieldValue} />
        case "[]Bool":
            return (
                <BoolListInput fieldName={fieldName} fieldValue={fieldValue} />
            )
        case "[]ByteArray":
            return (
                <ByteArrayListInput
                    fieldName={fieldName}
                    fieldValue={fieldValue}
                />
            )
        case "[]Int":
            return (
                <IntListInput fieldName={fieldName} fieldValue={fieldValue} />
            )
        case "[]Ratio":
            return (
                <RatioListInput fieldName={fieldName} fieldValue={fieldValue} />
            )
        case "[]Real":
            return (
                <RealListInput fieldName={fieldName} fieldValue={fieldValue} />
            )
        case "[]String":
            return (
                <StringListInput
                    fieldName={fieldName}
                    fieldValue={fieldValue}
                />
            )
        default:
            return (
                <GenericInput
                    fieldName={fieldName}
                    fieldType={fieldType}
                    fieldValue={fieldValue}
                />
            )
    }
}
