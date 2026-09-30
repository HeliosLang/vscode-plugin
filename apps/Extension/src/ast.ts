import { capturedCompileOptions } from "./captureCompilation"
import {
    genDummyHash,
    type CompilationContext,
    type ArgsPanelEntryPoint
} from "schemas"
import { Program } from "@helios-lang/compiler"
import { type ErrorCollector } from "@helios-lang/compiler-utils"
import { type UplcProgramV2 } from "@helios-lang/uplc"

export function collectEntryPointInfo(
    ast: Program | undefined,
    entryPoint: string | undefined
): ArgsPanelEntryPoint | undefined {
    if (!ast || !entryPoint) {
        return undefined
    }

    let args: { name: string; type: string; optional: boolean }[] = []
    let needsScriptContext = false
    let needsCurrentValidator = false

    if (entryPoint == "main") {
        args = ast.entryPoint.mainFunc.args.map((a) => ({
            name: a.name.value,
            type: a.type.toString(),
            optional: false
        }))

        // main function that don't actually depend on the ScriptContext are rare and shouldn't exist
        needsScriptContext = true
    } else {
        const moduleName = ast.entryPoint.mainModule.name.value
        const fn = ast.userFunctions[moduleName]?.[entryPoint]

        if (!fn) {
            return undefined
        }

        try {
            const fnStmnt = fn.mainFunc

            args = fnStmnt.args.map((a) => ({
                name: a.name.value,
                type: a.type.toString(),
                optional: a.isOptional
            }))
        } catch (_e) {
            // is a const, nothing needs to change
        }

        if (ast.props.validatorTypes) {
            const validatorTypes = ast.props.validatorTypes

            const { requiresScriptContext, requiresCurrentScript } = fn.toIR({
                hashDependencies: genDummyHashes(Object.keys(validatorTypes)),
                validatorTypes: validatorTypes,
                optimize: false
            })

            needsScriptContext = requiresScriptContext

            if (ast.purpose == "module" || ast.purpose.includes("test")) {
                needsCurrentValidator = requiresCurrentScript
            }
        }
    }

    return {
        name: entryPoint,
        args,
        needsScriptContext,
        needsCurrentValidator
    }
}

/**
 * @param errors
 */
export function collectErrorUris(errors: ErrorCollector | undefined): string[] {
    if (!errors) {
        return []
    }

    const s: Set<string> = new Set()

    for (let e of errors.errors) {
        if (!e.site.file.startsWith("::")) {
            s.add(e.site.file)
        }
    }

    return Array.from(s).map((f) => f)
}

function collectSortedValidators(ast: Program | undefined): string[] {
    if (!ast) {
        return []
    }

    const names = Object.keys(ast.props.validatorTypes ?? {}).slice()

    names.sort()

    return names
}

export function collectValidators(
    ast: Program | undefined
): { name: string; purpose: string }[] {
    const names = collectSortedValidators(ast)
    if (!ast) {
        return []
    }

    const validatorTypes: Record<string, any> = ast.props.validatorTypes ?? {}

    const entries = names.map((name) => {
        const purpose = (() => {
            switch (validatorTypes[name].toString()) {
                case "ScriptHash":
                    return "mixed"
                case "ValidatorHash":
                    return "spending"
                case "StakingValidatorHash":
                    return "staking"
                case "MintingPolicyHash":
                    return "minting"
                default:
                    return "mixed"
            }
        })()

        return { name, purpose }
    })

    return entries
}

export function sortedValidatorIndices(
    ast: Program | undefined
): Record<string, number> {
    const names = collectSortedValidators(ast)

    return Object.fromEntries(names.map((name, i) => [name, i]))
}

// TODO: compile with source map
export function compileEntryPoint(
    ast: Program | undefined,
    entryPoint: string | undefined,
    compilation?: CompilationContext
): UplcProgramV2 | undefined {
    const entryPointInfo = collectEntryPointInfo(ast, entryPoint)
    if (!ast || !entryPoint || !entryPointInfo) {
        return undefined
    }

    const validatorTypes = ast.props.validatorTypes

    if (!validatorTypes) {
        return undefined
    }

    const capturedOptions = compilation
        ? capturedCompileOptions(compilation)
        : undefined
    const hashDependencies =
        capturedOptions?.hashDependencies ??
        genDummyHashes(Object.keys(validatorTypes))
    const validatorIndices = compilation
        ? capturedOptions?.validatorIndices
        : sortedValidatorIndices(ast)

    if (entryPoint == "main") {
        return ast.compile({
            ...capturedOptions,
            optimize: false,
            onCompileUserFunc: undefined,
            hashDependencies: hashDependencies,
            validatorIndices
        })
    }

    const moduleName = ast.entryPoint.mainModule.name.value
    const fn = ast.userFunctions[moduleName]?.[entryPoint]

    if (!fn) {
        return undefined
    }

    return fn.compile({
        optimize: false,
        hashDependencies,
        validatorTypes,
        validatorIndices
    })
}

export function entryPointIsConst(
    ast: Program | undefined,
    entryPoint: string | undefined
): boolean {
    if (!ast || !entryPoint || entryPoint == "main") {
        return false
    }
    const moduleName = ast.entryPoint.mainModule.name.value
    const fn = ast.userFunctions[moduleName]?.[entryPoint]

    if (!fn) {
        return false
    }

    try {
        fn.mainConst
        return true
    } catch (_e) {
        return false
    }
}

function genDummyHashes(validators: string[]): Record<string, string> {
    let result: Record<string, string> = {}

    for (let name of validators) {
        result[name] = genDummyHash(name)
    }

    return result
}
