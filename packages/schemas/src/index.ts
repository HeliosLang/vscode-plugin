import { Schema } from "effect"

export const FileViewContext = Schema.Struct({
    kind: Schema.Literal("FileViewContext"),
    uri: Schema.String,
    purpose: Schema.String,
    allValidatorNames: Schema.Array(Schema.String),
    errorUris: Schema.Array(Schema.String),
    isLoading: Schema.Boolean,
    entryPoints: Schema.Array(Schema.String)
})

export type FileViewContext = Schema.Schema.Type<typeof FileViewContext>

const EntryPointArg = Schema.Struct({
    name: Schema.String,
    type: Schema.String
})

export const EntryPointViewContext = Schema.Struct({
    kind: Schema.Literal("EntryPointViewContext"),
    uri: Schema.String,
    name: Schema.String,
    arguments: Schema.Array(EntryPointArg),
    needsScriptContext: Schema.Boolean,
    needsCurrentValidator: Schema.Boolean
})

export type EntryPointViewContext = Schema.Schema.Type<
    typeof EntryPointViewContext
>

// TODO: events

export const SelectEntryPointEvent = Schema.Struct({
    kind: Schema.Literal("SelectEntryPointEvent"),
    name: Schema.String
})

export type SelectEntryPointEvent = Schema.Schema.Type<
    typeof SelectEntryPointEvent
>

export const GoToErrorEvent = Schema.Struct({
    kind: Schema.Literal("GoToErrorEvent"),
    uri: Schema.String
})

export type GoToErrorEvent = Schema.Schema.Type<typeof GoToErrorEvent>

export const ChangeArgValueEvent = Schema.Struct({
    kind: Schema.Literal("ChangeArgValueEvent"),
    name: Schema.String,
    type: Schema.String,
    value: Schema.optional(Schema.String)
})

export type ChangeArgValueEvent = Schema.Schema.Type<typeof ChangeArgValueEvent>
