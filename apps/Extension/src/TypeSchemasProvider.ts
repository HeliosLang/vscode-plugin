import { type TypeSchema } from "@helios-lang/type-utils"
import { resolveSchema } from "schemas"

type TypeSchemasListener = (schemas: Record<string, TypeSchema>) => void

export class TypeSchemasProvider {
    private schemas_: Record<string, TypeSchema>
    private listeners: TypeSchemasListener[]

    constructor() {
        this.schemas_ = {}
        this.listeners = []
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
