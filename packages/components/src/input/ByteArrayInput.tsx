import { ReactNode } from "react";
import { ByteArrayLikeInput } from "./ByteArrayLikeInput";

type ByteArrayInputProps = {
    fieldName: string
    fieldValue: string
    label?: ReactNode
}

const TYPE_NAME = "ByteArray"

export function ByteArrayInput({fieldName, fieldValue, label}: ByteArrayInputProps) {
    return <ByteArrayLikeInput fieldType={TYPE_NAME} fieldName={fieldName} fieldValue={fieldValue} label={label} />
}