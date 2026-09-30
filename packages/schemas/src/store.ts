import { validCompilationContext, type CompilationContext } from "./compilation"
import { TypeSchema } from "@helios-lang/type-utils"
import { Schema } from "effect"
import { convertFieldsToUplcData } from "./values"
import { bytesToHex } from "@helios-lang/codec-utils"

export const Store = Schema.mutable(
    Schema.Struct({
        captureContexts: Schema.optional(
            Schema.mutable(
                Schema.Record({
                    key: Schema.String,
                    value: Schema.Struct({
                        captureId: Schema.String,
                        evaluationIndex: Schema.Number,
                        scriptHash: Schema.String,
                        compilation: Schema.optional(
                            Schema.declare<CompilationContext>(
                                validCompilationContext
                            )
                        )
                    })
                })
            )
        ),
        values: Schema.mutable(
            Schema.Record({
                key: Schema.String,
                value: Schema.mutable(
                    Schema.Record({
                        key: Schema.String,
                        value: Schema.String
                    })
                )
            })
        ),
        links: Schema.mutable(
            Schema.Record({
                key: Schema.String,
                value: Schema.String
            })
        )
    })
)

export type Store = Schema.Schema.Type<typeof Store>

export class StoreHelper {
    private readonly store: Store

    constructor(store: Store) {
        this.store = store
    }

    get values() {
        return this.store.values
    }

    getFields(contextKey: string): Record<string, string> | undefined {
        return this.store.values[contextKey]
    }

    getValue(contextKey: string, schema: TypeSchema): string | undefined {
        const fields = this.store.values[contextKey]

        if (!fields) {
            return undefined
        }

        return bytesToHex(convertFieldsToUplcData(schema, fields).toCbor())
    }

    getFieldValue(contextKey: string, fieldName: string): string | undefined {
        return this.store.values[contextKey]?.[fieldName]
    }

    /**
     * Looks for entries with `typeName::` prefix, and returns a record where the keys are without that prefix
     * @param typeName
     * @returns
     */
    getTypeValues(typeName: string): Record<string, Record<string, string>> {
        const prefix = typeName + "::"

        const result: Record<string, Record<string, string>> = {}

        for (let key in this.store.values) {
            if (key.startsWith(prefix)) {
                result[key.slice(prefix.length)] = this.store.values[key]
            }
        }

        return result
    }

    getTypeOptions(typeName: string): string[] {
        return Object.keys(this.getTypeValues(typeName))
    }

    /**
     * @param key
     * Format: `typeName::valueName`
     *
     * @returns
     */
    hasValue(key: string): boolean {
        return key in this.store.values
    }

    findValueNames(
        typeName: string,
        schema: TypeSchema,
        cborHex: string
    ): string[] {
        const options = this.getTypeValues(typeName)

        const valueNames: string[] = []

        for (let valueName in options) {
            if (
                bytesToHex(
                    convertFieldsToUplcData(schema, options[valueName]).toCbor()
                ) == cborHex
            ) {
                valueNames.push(valueName)
            }
        }

        return valueNames
    }

    getValidLink(contextKey: string, fieldName: string): string | undefined {
        const fullKey = `${contextKey}::${fieldName}`

        const link = this.store.links[fullKey]

        if (!link) {
            return undefined
        }

        if (!this.hasValue(link)) {
            return undefined
        }

        return link
    }

    getValidLinkValueName(
        contextKey: string,
        fieldName: string
    ): string | undefined {
        const link = this.getValidLink(contextKey, fieldName)

        if (!link) {
            return undefined
        }

        return link.split("::").slice(1).join("::")
    }
}
