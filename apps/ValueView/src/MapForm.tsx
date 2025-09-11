import { type MapTypeSchema } from "@helios-lang/type-utils"
import { GenericMapForm } from "./GenericMapForm"

type MapFormProps = {
    schema: MapTypeSchema
    fields: Record<string, string>
}

export function MapForm({ schema, fields }: MapFormProps) {
    return (
        <GenericMapForm
            schema={schema}
            fields={fields}
            keyPrefix="key"
            valuePrefix="value"
        />
    )
}
