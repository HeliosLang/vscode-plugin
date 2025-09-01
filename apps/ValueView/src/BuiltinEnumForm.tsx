import { ArgInput, Select, useContextKey, useVsCodeApi } from "components"
import { useCallback } from "react"
import { ChangeFieldValueEvent, deriveTypeName } from "schemas"
import { VariantTypeSchema } from "@helios-lang/type-utils"

type BuiltinEnumFormProps = {
    variants: VariantTypeSchema[]
    defaultVariant?: string
    fields: Record<string, string>
}

export function BuiltinEnumForm({ variants, defaultVariant, fields }: BuiltinEnumFormProps) {
    const vscode = useVsCodeApi()
    const contextKey = useContextKey()

    const def = defaultVariant ?? variants[0].name
    const options = variants.map(v => v.name)
    const variantName = ("_tag" in fields) ? (variants[parseInt(fields._tag)]?.name ?? def) : def

    const handleChangeVariant = useCallback(
        (newVariantName: string) => {
            const newVariant = variants.find(v => v.name == newVariantName)

            if (newVariant) {
                vscode.postMessage({
                    kind: "ChangeFieldValue",
                    contextKey,
                    fieldName: "_tag",
                    fieldType: "",
                    fieldValue: newVariant.tag.toString()
                } satisfies ChangeFieldValueEvent)
            }
        },
        [vscode, contextKey, variants]
    )

    const variant = variants.find(v => v.name == variantName)

    return (
        <>
            <h3>Variant</h3>
            <Select
                value={variantName}
                options={options}
                onChange={handleChangeVariant}
            />

            {
                variant && variant.fieldTypes.length > 0 && <>
                    <h3>Fields</h3>
                    <>
                        {
                            variant.fieldTypes.map(ft => {
                                const key = ft.name
                                return <ArgInput
                                    key={key}
                                    fieldName={key}
                                    fieldType={deriveTypeName(ft.type)}
                                    fieldValue={fields[key]}
                                />   
                            })
                        }
                    </>   
                </>
            }
        </>
    )
}
