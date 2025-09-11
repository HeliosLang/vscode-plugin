import { useMemo } from "react"
import {
    VariantTypeSchema,
    type OptionTypeSchema
} from "@helios-lang/type-utils"
import { BuiltinEnumForm } from "./BuiltinEnumForm"

type OptionFormProps = {
    schema: OptionTypeSchema
    fields: Record<string, string>
}

export function OptionForm({ schema, fields }: OptionFormProps) {
    const variants = useMemo(() => {
        return [
            {
                kind: "variant",
                id: "Some",
                name: "Some",
                tag: 0,
                fieldTypes: [
                    {
                        name: "some",
                        type: schema.someType
                    }
                ]
            },
            {
                kind: "variant",
                id: "None",
                name: "None",
                tag: 1,
                fieldTypes: []
            }
        ] satisfies VariantTypeSchema[]
    }, [schema])

    return (
        <BuiltinEnumForm
            variants={variants}
            defaultVariant="None"
            fields={fields}
        />
    )
}
