import { Schema } from "effect"

export const Store = Schema.mutable(
    Schema.Struct({
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

    getValue(type: string, name: string): string | undefined {
        return this.store.values[type]?.[name]
    }

    getTypeValues(type: string): Record<string, string> {
        return this.store.values[type] ?? {}
    }

    getTypeOptionsWithNIL(type: string): string[] {
        return Object.keys(this.store.values[type] ?? {}).concat(["NIL"])
    }

    hasValue(type: string, name: string): boolean {
        return this.store.values[type]?.[name] !== undefined
    }

    findValueNames(type: string, value: string): string[] {
        const obj = this.store.values[type]

        if (!obj) {
            return []
        }

        const valueNames: string[] = []

        for (let valueName in obj) {
            if (obj[valueName] == value) {
                valueNames.push(valueName)
            }
        }

        return valueNames
    }

    getPreferredValueName(key: string, name: string): string | undefined {
        const fullKey = `${key}::${name}`

        if (fullKey in this.store.links) {
            const [before, ...after] = this.store.links[fullKey].split("::")
            const preferName = after.join("::")

            if (this.hasValue(before, preferName)) {
                return preferName
            }
        }

        return undefined
    }
}
