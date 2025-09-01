import { ArgInput, Select, useContextKey, useVsCodeApi } from "components"
import { ChangeFieldValueEvent, deriveTypeName } from "schemas"
import { type EnumTypeSchema, expectDefined } from "@helios-lang/type-utils"
import { useCallback } from "react"

type EnumFormProps = {
    schema: EnumTypeSchema
    fields: Record<string, string>
}

export function EnumForm({ schema, fields }: EnumFormProps) {
    const vscode = useVsCodeApi()
    const contextKey = useContextKey()
    const tag = parseInt(expectDefined(fields._tag, "_tag not defined"))
    const variant = expectDefined(
        schema.variantTypes.find((vt) => vt.tag == tag),
        `variant for tag ${tag} not found`
    )
    const variantName = variant.name
    const variantOptions = schema.variantTypes.map((vt) => vt.name)

    // TODO: what to do if fields are corrupt?

    const handleChangeVariant = useCallback(
        (newVariantName: string) => {
            const variant = schema.variantTypes.find(
                (vt) => vt.name == newVariantName
            )
            if (!variant) {
                return
            }

            vscode.postMessage({
                kind: "ChangeFieldValue",
                contextKey,
                fieldName: "_tag",
                fieldType: "",
                fieldValue: variant.tag.toString()
            } satisfies ChangeFieldValueEvent)
        },
        [vscode, contextKey, schema]
    )

    return (
        <>
            <h3>Variant</h3>
            <Select
                value={variantName}
                options={variantOptions}
                onChange={handleChangeVariant}
            />

            <h3>Fields</h3>
            <>
                {variant.fieldTypes.map((f) => {
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
