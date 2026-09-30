import { Program, getScriptHashType, VERSION } from "@helios-lang/compiler"
import { bytesToHex } from "@helios-lang/codec-utils"
import { decodeUplcData } from "@helios-lang/uplc"
import {
    validCompilationContext,
    type CompilationContext,
    type CompilationOptions
} from "schemas"

const purposes: Record<string, string> = {
    ValidatorHash: "spending",
    MintingPolicyHash: "minting",
    StakingValidatorHash: "staking",
    ScriptHash: "mixed"
}
export function compilationOptions(c: CompilationOptions) {
    return {
        ...c,
        hashDependencies: { ...c.hashDependencies },
        validatorIndices: c.validatorIndices
            ? { ...c.validatorIndices }
            : undefined
    }
}
export function capturedProgram(
    ast: Program,
    context?: CompilationContext
): Program {
    if (!context) return ast
    if (!validCompilationContext(context))
        throw new Error("Invalid captured compilation context")
    if (
        ast.name !== context.validator.name ||
        ast.purpose !== context.validator.purpose
    )
        throw new Error(
            "Captured validator identity does not match local source"
        )
    const program = new Program(ast.entryPoint.mainModule.sourceCode, {
        ...ast.props,
        moduleSources: ast.entryPoint.mainImportedModules.map(
            (m) => m.sourceCode
        ),
        validatorTypes: Object.fromEntries(
            Object.entries(context.validatorTypes).map(([k, v]) => [
                k,
                getScriptHashType(purposes[v])
            ])
        ),
        isTestnet: context.isTestnet,
        throwCompilerErrors: true
    })
    for (const [name, cbor] of Object.entries(context.parameters)) {
        try {
            const data = decodeUplcData(cbor)
            if (!program.changeParam(name, data))
                throw new Error("Parameter is absent from local source")
        } catch (error) {
            throw new Error(
                `Cannot apply captured parameter ${name}: ${(error as Error).message}`
            )
        }
    }
    return program
}
export function capturedCompileOptions(
    context: CompilationContext,
    optimized = false
) {
    const options = compilationOptions(
        optimized ? context.optimized : context.unoptimized
    )
    // ownHash is merged only for the unoptimized compiler invocation, as in contract-utils.
    if (options.ownHash)
        options.hashDependencies[context.validator.name] = options.ownHash
    return { ...options, optimize: optimized }
}
export function verifyCompilation(
    ast: Program,
    context: CompilationContext,
    expectedHash: string
) {
    const program = capturedProgram(ast, context)
    const hash = bytesToHex(
        program.compile(capturedCompileOptions(context, true)).hash()
    )
    return {
        matches: hash === expectedHash,
        hash,
        expectedHash,
        capturedCompiler: context.compilerVersion,
        localCompiler: VERSION
    }
}
