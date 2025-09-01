import { ReactNode } from "react"
import { BoolInput } from "./BoolInput"
import { BoolListInput } from "./BoolListInput"
import { ByteArrayInput } from "./ByteArrayInput"
import { ByteArrayListInput } from "./ByteArrayListInput"
import { GenericInput } from "./GenericInput"
import { IntLikeInput } from "./IntLikeInput"
import { IntListInput } from "./IntListInput"
import { RatioInput } from "./RatioInput"
import { RatioListInput } from "./RatioListInput"
import { RealInput } from "./RealInput"
import { RealListInput } from "./RealListInput"
import { StringInput } from "./StringInput"
import { StringListInput } from "./StringListInput"
import { MintingPolicyHashInput } from "./MintingPolicyHashInput"

type ArgInputProps = {
    fieldName: string
    // eg. item-0

    fieldType: string
    // e.g. "Int", or "[]Int"

    fieldValue: string
    // cbor hex of UplcData

    label?: ReactNode
    // custom label
}

export function ArgInput({ fieldName, fieldType, fieldValue, label }: ArgInputProps) {
    switch (fieldType) {
        case "Bool":
            return <BoolInput fieldName={fieldName} fieldValue={fieldValue} label={label} />
        case "ByteArray":
            return (
                <ByteArrayInput fieldName={fieldName} fieldValue={fieldValue} label={label} />
            )
        case "Duration":
        case "Int":
        case "Time":
            return <IntLikeInput fieldName={fieldName} fieldValue={fieldValue} typeName={fieldType} label={label} />
        case "Ratio":
            return <RatioInput fieldName={fieldName} fieldValue={fieldValue} label={label} />
        case "Real":
            return <RealInput fieldName={fieldName} fieldValue={fieldValue} label={label} />
        case "String":
            return <StringInput fieldName={fieldName} fieldValue={fieldValue} label={label} />
        case "[]Bool":
            return (
                <BoolListInput fieldName={fieldName} fieldValue={fieldValue} label={label} />
            )
        case "[]ByteArray":
            return (
                <ByteArrayListInput
                    label={label}
                    fieldName={fieldName}
                    fieldValue={fieldValue}
                />
            )
        case "[]Int":
            return (
                <IntListInput label={label} fieldName={fieldName} fieldValue={fieldValue} />
            )
        case "[]Ratio":
            return (
                <RatioListInput label={label} fieldName={fieldName} fieldValue={fieldValue} />
            )
        case "[]Real":
            return (
                <RealListInput label={label} fieldName={fieldName} fieldValue={fieldValue} />
            )
        case "[]String":
            return (
                <StringListInput
                    label={label}
                    fieldName={fieldName}
                    fieldValue={fieldValue}
                />
            )
        case "MintingPolicyHash":
            return (
                <MintingPolicyHashInput
                    fieldName={fieldName}
                    fieldValue={fieldValue}
                    label={label}
                />
            )
        default:
            return (
                <GenericInput
                    label={label}
                    fieldName={fieldName}
                    fieldType={fieldType}
                    fieldValue={fieldValue}
                />
            )
    }
}
