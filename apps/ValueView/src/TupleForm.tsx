import { ArgInput } from "components"
import { deriveTypeName } from "schemas"
import { expectDefined, TupleTypeSchema } from "@helios-lang/type-utils"

type TupleFromProps = {
    schema: TupleTypeSchema
    fields: Record<string, string>
}

export function TupleForm({ schema, fields }: TupleFromProps) {
    return (
        <>
            <h3>Items</h3>
            {schema.itemTypes.map((it, i) => {
                const key = `item-${i}`

                return (
                    <ArgInput
                        key={key}
                        fieldName={key}
                        fieldType={deriveTypeName(it)}
                        fieldValue={expectDefined(fields[key])}
                    />
                )
            })}
        </>
    )
}
