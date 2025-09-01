import { GenericInput } from "./GenericInput"

const TYPE_NAME = "ScriptContext"

type ScriptContextInputProps = {
    value: string
}

export function ScriptContextInput({value}: ScriptContextInputProps) {
    return <GenericInput 
        label={<label>ScriptContext</label>}
        fieldName={TYPE_NAME}
        fieldType={TYPE_NAME}
        fieldValue={value}
    />
}
