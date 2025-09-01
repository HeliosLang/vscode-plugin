import { type TypeSchema } from "@helios-lang/type-utils"
import { resolveSchema } from "schemas"
import { ASTProvider } from "./ASTProvider"
import { Program } from "@helios-lang/compiler"

type TypeSchemasListener = (schemas: Record<string, TypeSchema>) => void

export class TypeSchemasProvider {
    private schemas_: Record<string, TypeSchema>
    private listeners: TypeSchemasListener[]

    constructor(astProvider: ASTProvider) {
        this.schemas_ = {}
        this.listeners = []

        astProvider.addCompileListener((programs: Record<string, Program>) => {
            this.setSchemas(collectTypeSchemas(programs))
        })
    }

    get schemas() {
        return this.schemas_
    }

    addListener(callback: TypeSchemasListener) {
        this.listeners.push(callback)
        callback(this.schemas_)
    }

    setSchemas(schemas: Record<string, TypeSchema>) {
        this.schemas_ = schemas
        this.listeners.forEach((callback) => callback(schemas))
    }

    resolveSchema(typeName: string): TypeSchema {
        return resolveSchema(this.schemas, typeName)
    }
}

function collectTypeSchemas(
    programs: Record<string, Program>
): Record<string, TypeSchema> {
    const result: Record<string, TypeSchema> = {}

    for (let programKey in programs) {
        const p = programs[programKey]

        const types = p.userTypes

        for (let moduleName in types) {
            const moduleTypes = types[moduleName]

            // just keep the inner name

            for (let typeName in moduleTypes) {
                result[typeName] = moduleTypes[typeName].toSchema()
            }
        }
    }

    return result
}
