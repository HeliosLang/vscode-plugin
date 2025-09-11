import { StructTypeSchema } from "@helios-lang/type-utils"
import { ArgInput } from "components"
import { deriveTypeName } from "schemas"

type BuiltinStructFormProps = {
    schema: StructTypeSchema
    fields: Record<string, string>
}

export function BuiltinStructForm({ schema, fields }: BuiltinStructFormProps) {
    return (
        <>
            <h3>Fields</h3>
            {schema.fieldTypes.map((ft) => {
                const key = ft.name

                return (
                    <ArgInput
                        key={key}
                        fieldName={key}
                        fieldType={deriveTypeName(ft.type)}
                        fieldValue={fields[key]}
                    />
                )
            })}
        </>
    )
}
