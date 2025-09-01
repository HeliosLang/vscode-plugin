import { Schema } from "effect"

export const ChangeEntryPointEvent = Schema.Struct({
    kind: Schema.Literal("ChangeEntryPoint"),
    entryPointName: Schema.String
})

export type ChangeEntryPointEvent = Schema.Schema.Type<
    typeof ChangeEntryPointEvent
>

export const ChangeFieldValueEvent = Schema.Struct({
    kind: Schema.Literal("ChangeFieldValue"),
    contextKey: Schema.String,
    fieldName: Schema.String,
    fieldType: Schema.String,
    fieldValue: Schema.String,
    link: Schema.optional(Schema.String) // optional link to another contextKey
})

export type ChangeFieldValueEvent = Schema.Schema.Type<
    typeof ChangeFieldValueEvent
>

export const ChangeValueNameEvent = Schema.Struct({
    kind: Schema.Literal("ChangeValueName"),
    typeName: Schema.String,
    oldName: Schema.String,
    newName: Schema.String
})

export type ChangeValueNameEvent = Schema.Schema.Type<
    typeof ChangeValueNameEvent
>

export const ClickErrorEvent = Schema.Struct({
    kind: Schema.Literal("ClickError"),
    errorUri: Schema.String
})

export type ClickErrorEvent = Schema.Schema.Type<typeof ClickErrorEvent>

export const CreateValueEvent = Schema.Struct({
    kind: Schema.Literal("CreateValue"),
    typeName: Schema.String,
    valueName: Schema.String,
    callerContextKey: Schema.String,
    callerFieldName: Schema.String,
    linkToCaller: Schema.Boolean
})

export type CreateValueEvent = Schema.Schema.Type<typeof CreateValueEvent>

export const DeleteValueEvent = Schema.Struct({
    kind: Schema.Literal("DeleteValue"),
    typeName: Schema.String,
    valueName: Schema.String
})

export type DeleteValueEvent = Schema.Schema.Type<typeof DeleteValueEvent>

export const EditValueEvent = Schema.Struct({
    kind: Schema.Literal("EditValue"),
    typeName: Schema.String,
    valueName: Schema.String,
    callerContextKey: Schema.String,
    callerFieldName: Schema.String
})

export type EditValueEvent = Schema.Schema.Type<typeof EditValueEvent>

export const PanelIsReadyEvent = Schema.Struct({
    kind: Schema.Literal("PanelIsReady")
})

export type PanelIsReadyEvent = Schema.Schema.Type<typeof PanelIsReadyEvent>

export const PanelEvent = Schema.Union(
    ChangeEntryPointEvent,
    ChangeFieldValueEvent,
    ChangeValueNameEvent,
    ClickErrorEvent,
    CreateValueEvent,
    CreateValueEvent,
    DeleteValueEvent,
    EditValueEvent,
    PanelIsReadyEvent
)

export type PanelEvent = Schema.Schema.Type<typeof PanelEvent>
