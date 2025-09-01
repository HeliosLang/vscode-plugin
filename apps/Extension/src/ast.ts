import { genDummyHash, type ArgsPanelEntryPoint } from "schemas"
import { bytesToHex, encodeUtf8 } from "@helios-lang/codec-utils"
import { Program } from "@helios-lang/compiler"
import { type ErrorCollector } from "@helios-lang/compiler-utils"
import { blake2b } from "@helios-lang/crypto"
import { type UplcProgramV2 } from "@helios-lang/uplc"

export function collectEntryPointInfo(
    ast: Program | undefined,
    entryPoint: string | undefined
): ArgsPanelEntryPoint | undefined {
    if (!ast || !entryPoint) {
        return undefined
    }

    let args: { name: string; type: string, optional: boolean }[] = []
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

export function collectValidators(ast: Program | undefined): {name: string, purpose: string}[] {
    if (!ast) {
        return []
    }
    
    return Object.entries(ast.props.validatorTypes ?? {}).map(([key, value]) => {
        return {
            name: key,
            purpose: {
                "ScriptHash": "mixed",
                "ValidatorHash": "spending",
                "StakingValidatorHash": "staking",
                "MintingPolicyHash": "minting"
            }[value.name] ?? "mixed"
        }
    })
}

// TODO: compile with source map
export function compileEntryPoint(
    ast: Program | undefined,
    entryPoint: string | undefined
): UplcProgramV2 | undefined {
    if (!ast || !entryPoint) {
        return undefined
    }

    const validatorTypes = ast.props.validatorTypes

    if (!validatorTypes) {
        return undefined
    }

    const hashDependencies = genDummyHashes(Object.keys(validatorTypes))

    if (entryPoint == "main") {
        return ast.compile({
            optimize: false,
            onCompileUserFunc: undefined,
            hashDependencies: hashDependencies
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
        validatorTypes
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
