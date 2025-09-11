import { makeNilValue } from "schemas"
import { GenericInput } from "./GenericInput"
import { useMemo } from "react"

const TYPE_NAME = "ScriptContext"

type ScriptContextInputProps = {
    value: string | undefined
}

export function ScriptContextInput({ value }: ScriptContextInputProps) {
    const valueOrFallback = useMemo(() => {
        return (
            value ?? makeNilValue({ kind: "internal", name: "ScriptContext" })
        )
    }, [value])

    return (
        <GenericInput
            label={<label>ScriptContext</label>}
            fieldName={TYPE_NAME}
            fieldType={TYPE_NAME}
            fieldValue={valueOrFallback}
        />
    )
}
