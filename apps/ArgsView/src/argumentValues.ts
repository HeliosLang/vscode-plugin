import {
    makeDefaultValue,
    tryResolveSchema,
    type ArgsPanelEntryPoint
} from "schemas"

// Ignored arguments are preserved separately for execution, not edited here.
export function resolveArgumentValues(
    args: ArgsPanelEntryPoint["args"],
    schemas: Parameters<typeof tryResolveSchema>[0],
    getValue: (name: string) => string | undefined
): Record<string, string> | undefined {
    const values: Record<string, string> = {}
    for (const arg of args) {
        if (arg.name === "_") continue
        const value = getValue(arg.name)
        if (value !== undefined) {
            values[arg.name] = value
        } else {
            const schema = tryResolveSchema(schemas, arg.type)
            if (!schema) return undefined
            values[arg.name] = makeDefaultValue(schema)
        }
    }
    return values
}
