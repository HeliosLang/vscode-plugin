import { ArgInput, Select, useContextKey, useVsCodeApi } from "components"
import { GenericListForm } from "./GenericListForm"
import { useCallback } from "react"
import { MapForm } from "./MapForm"
import { ListForm } from "./ListForm"

type DataFormProps = {
    fields: Record<string, string>
}

const VARIANT_NAMES = [
    "ConstrData",
    "MapData",
    "ListData",
    "IntData",
    "ByteArrayData"
]

export function DataForm({ fields }: DataFormProps) {
    const vscode = useVsCodeApi()
    const contextKey = useContextKey()
    const tag = parseInt(fields._tag)
    const variantName = VARIANT_NAMES[tag] ?? "ConstrData"

    const handleChangeVariant = useCallback(
        (newVariantName: string) => {
            const tag = VARIANT_NAMES.indexOf(newVariantName)

            if (tag == -1) {
                return
            }

            vscode.postMessage({
                kind: "ChangeFieldValue",
                contextKey,
                fieldName: "_tag",
                fieldType: "",
                fieldValue: tag.toString()
            })
        },
        [vscode, contextKey]
    )
    return (
        <>
            <h3>Variant</h3>
            <Select
                value={variantName}
                options={VARIANT_NAMES}
                onChange={handleChangeVariant}
            />

            {variantName == "ConstrData" && (
                <>
                    <h3>Tag</h3>
                    <ArgInput
                        label={<></>}
                        fieldName="tag"
                        fieldType="Int"
                        fieldValue={fields.tag}
                    />

                    <GenericListForm
                        itemSchema={{ kind: "internal", name: "Data" }}
                        sectionTitle="Entries"
                        fields={fields}
                        prefix="field"
                    />
                </>
            )}

            {variantName == "MapData" && (
                <>
                    <MapForm
                        schema={{
                            kind: "map",
                            keyType: { kind: "internal", name: "Data" },
                            valueType: { kind: "internal", name: "Data" }
                        }}
                        fields={fields}
                    />
                </>
            )}

            {variantName == "ListData" && (
                <>
                    <ListForm
                        schema={{
                            kind: "list",
                            itemType: { kind: "internal", name: "Data" }
                        }}
                        fields={fields}
                    />
                </>
            )}

            {variantName == "IntData" && (
                <>
                    <h3>Value</h3>
                    <ArgInput
                        fieldName="value"
                        fieldType="Int"
                        fieldValue={fields["value"]}
                    />
                </>
            )}

            {variantName == "ByteArrayData" && (
                <>
                    <h3>Value</h3>
                    <ArgInput
                        fieldName="bytes"
                        fieldType="ByteArray"
                        fieldValue={fields["bytes"]}
                    />
                </>
            )}
        </>
    )
}
