import { type Program } from "@helios-lang/compiler"
import { type TypeSchema } from "@helios-lang/type-utils"
import { deriveTypeName } from "schemas"

function qualifiedName(schema: { id: string; name: string }): string {
    const match = /^__module__(\w+)__(\w+)\[\](?:__(\w+))?$/.exec(schema.id)
    return match
        ? [match[1], match[2], match[3]].filter(Boolean).join("::")
        : schema.id
}

function mapSchema(schema: TypeSchema, names: Map<string, string>): TypeSchema {
    const visit = (value: any): any => {
        if (Array.isArray(value)) return value.map(visit)
        if (!value || typeof value !== "object") return value
        const result = Object.fromEntries(
            Object.entries(value).map(([key, child]) => [key, visit(child)])
        )
        if (
            typeof value.id === "string" &&
            typeof value.name === "string" &&
            names.has(value.id)
        )
            result.name = names.get(value.id)
        return result
    }
    return visit(schema)
}

/** The defining identity is stable; only conflicting display names are qualified. */
export function collectTypeSchemas(
    programs: Record<string, Program>
): Record<string, TypeSchema> {
    const types = new Map<string, TypeSchema & { id: string; name: string }>()
    const visit = (value: any) => {
        if (!value || typeof value !== "object") return
        if (["enum", "struct", "variant"].includes(value.kind))
            types.set(value.id, value)
        for (const child of Object.values(value)) {
            if (Array.isArray(child)) child.forEach(visit)
            else if (child && typeof child === "object") visit(child)
        }
    }
    for (const program of Object.values(programs)) {
        if (!program) continue
        for (const module of Object.values(program.userTypes))
            for (const type of Object.values(module)) visit(type.toSchema())
    }
    const counts = new Map<string, number>()
    for (const type of types.values())
        counts.set(type.name, (counts.get(type.name) ?? 0) + 1)
    const names = new Map(
        Array.from(types.values(), (type) => [
            type.id,
            counts.get(type.name)! > 1 ? qualifiedName(type) : type.name
        ])
    )
    const result: Record<string, TypeSchema> = {}
    for (const type of types.values()) {
        const schema = mapSchema(type, names)
        result[names.get(type.id)!] = schema
        // Qualified aliases keep older saved links resolvable when a conflict disappears.
        result[qualifiedName(type)] = schema
    }
    return result
}

export function entryPointTypeName(
    schema: TypeSchema,
    schemas: Record<string, TypeSchema>
): string {
    const names = new Map<string, string>()
    for (const type of Object.values(schemas))
        if ("id" in type && "name" in type) names.set(type.id, type.name)
    return deriveTypeName(mapSchema(schema, names))
}
