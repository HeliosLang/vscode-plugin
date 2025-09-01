import {
    expectDefined,
    type StructTypeSchema,
    type VariantTypeSchema
} from "@helios-lang/type-utils"
import { ArgInput } from "components"
import { deriveTypeName } from "schemas"

type StructFormProps = {
    schema: StructTypeSchema | VariantTypeSchema
    fields: Record<string, string>
}

export function StructForm({ schema, fields }: StructFormProps) {
    const fieldSchemas = schema.fieldTypes

    return (
        <>
            <h3>Fields</h3>
            <>
                {fieldSchemas.map((f) => {
                    const fieldValue = expectDefined(
                        fields[f.name],
                        `${schema.name}.${f.name} value not found`
                    )

                    return (
                        <ArgInput
                            key={f.name}
                            fieldName={f.name}
                            fieldType={deriveTypeName(f.type)}
                            fieldValue={fieldValue}
                        />
                    )
                })}
            </>
        </>
    )
}
