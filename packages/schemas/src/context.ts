import { Schema } from "effect"
import { Store } from "./store"

export const ArgsPanelEntryPoint = Schema.Struct({
    name: Schema.String,
    args: Schema.Array(
        Schema.Struct({
            name: Schema.String,
            type: Schema.String,
            optional: Schema.Boolean
        })
    ),
    needsScriptContext: Schema.Boolean,
    needsCurrentValidator: Schema.Boolean
})

export type ArgsPanelEntryPoint = Schema.Schema.Type<typeof ArgsPanelEntryPoint>

export const ArgsPanelContext = Schema.Struct({
    kind: Schema.Literal("ArgsPanel"),
    moduleUri: Schema.String,
    modulePurpose: Schema.String,
    moduleName: Schema.String,
    allValidators: Schema.Array(
        Schema.Struct({
            name: Schema.String,
            purpose: Schema.String
        })
    ),
    errorUris: Schema.Array(Schema.String),
    allEntryPoints: Schema.Array(Schema.String),
    entryPoint: Schema.optional(ArgsPanelEntryPoint)
})

export type ArgsPanelContext = Schema.Schema.Type<typeof ArgsPanelContext>

export const PanelLoadingContext = Schema.Struct({
    kind: Schema.Literal("PanelLoading")
})

export type PanelLoadingContext = Schema.Schema.Type<typeof PanelLoadingContext>

export const ValuePanelContext = Schema.Struct({
    kind: Schema.Literal("ValuePanel"),
    typeName: Schema.String,
    valueName: Schema.String,
    allValidators: Schema.Array(
        Schema.Struct({
            name: Schema.String,
            purpose: Schema.String
        })
    )
})

export type ValuePanelContext = Schema.Schema.Type<typeof ValuePanelContext>

export const PanelContext = Schema.Union(
    ArgsPanelContext,
    PanelLoadingContext,
    ValuePanelContext
)

export type PanelContext = Schema.Schema.Type<typeof PanelContext>

export const ValueStoreContext = Schema.Struct({
    kind: Schema.Literal("ValueStore"),
    store: Store
})

export type ValueStoreContext = Schema.Schema.Type<typeof ValueStoreContext>

export const TypeSchemasContext = Schema.Struct({
    kind: Schema.Literal("TypeSchemas"),
    schemas: Schema.Record({
        key: Schema.String, // name of the typeschema
        value: Schema.Any
    })
})

export type TypeSchemasContext = Schema.Schema.Type<typeof TypeSchemasContext>
