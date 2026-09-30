import { type Program } from "@helios-lang/compiler"
import { type TypeSchema } from "@helios-lang/type-utils"
import { type Store, importCapturedArguments } from "schemas"
import { collectEntryPointInfo } from "./ast"

/** Rebuild links from the owning entry point's CBOR; never guess which module
 * owns an ambiguous standalone legacy value. Preserve those old values intact.
 */
export function migrateArgumentNamespaces(
    ast: Program,
    store: Store,
    schemas: Record<string, TypeSchema>
): Store {
    if (ast.purpose === "module" || ast.errors.errors.length > 0) return store
    const contextKey = `${ast.name}::main`
    const values = store.values[contextKey]
    if (!values) return store
    const info = collectEntryPointInfo(ast, "main", schemas)
    if (!info) return store
    const args = info.args.map((arg, i) => ({
        name: arg.name === "_" ? `_captured_${i}` : arg.name,
        type: arg.name === "_" ? "Data" : arg.type
    }))
    if (info.needsScriptContext)
        args.push({ name: "ScriptContext", type: "ScriptContext" })
    if (
        !args.some((arg) => {
            if (values[arg.name] === undefined) return false
            const link = store.links[`${contextKey}::${arg.name}`]
            return link?.slice(0, link.lastIndexOf("::")) !== arg.type
        })
    )
        return store
    return importCapturedArguments(
        store,
        schemas,
        contextKey,
        "legacy",
        args
            .filter((arg) => values[arg.name] !== undefined)
            .map((arg) => ({ ...arg, cbor: values[arg.name] }))
    )
}
