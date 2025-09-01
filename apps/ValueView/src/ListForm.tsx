import { type ListTypeSchema } from "@helios-lang/type-utils"
import { GenericListForm } from "./GenericListForm"

type ListFormProps = {
    schema: ListTypeSchema
    fields: Record<string, string>
}

export function ListForm({ schema, fields }: ListFormProps) {
    return <GenericListForm prefix="item" sectionTitle="Items" itemSchema={schema.itemType} fields={fields} />
}
