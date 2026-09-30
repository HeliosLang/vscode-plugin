import { collectTypeSchemas } from "./typeSchemas"
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
            this.setSchemas(
                collectTypeSchemas({
                    ...programs,
                    __active:
                        astProvider.activeDocumentProgram ??
                        Object.values(programs)[
                            Object.values(programs).length - 1
                        ]!
                })
            )
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
