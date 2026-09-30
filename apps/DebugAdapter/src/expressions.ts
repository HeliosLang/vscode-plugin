import {
    validCompilationContext,
    type CompilationContext
} from "schemas/compilation"
import { Program, getScriptHashType } from "@helios-lang/compiler"
import { makeSource, type Site } from "@helios-lang/compiler-utils"
import {
    decodeUplcData,
    makeUplcProgramV2,
    type CekValue,
    type UplcTerm
} from "@helios-lang/uplc"

export type DebugSources = {
    compilation?: CompilationContext
    main: { name: string; content: string }
    modules: { name: string; content: string }[]
    validators: { name: string; purpose: string }[]
}

export class ExpressionEvaluator {
    private program: Program
    private compilation?: CompilationContext

    constructor(sources: DebugSources) {
        this.compilation = sources.compilation
        this.program = new Program(
            makeSource(sources.main.content, { name: sources.main.name }),
            {
                moduleSources: sources.modules.map((s) =>
                    makeSource(s.content, { name: s.name })
                ),
                validatorTypes: Object.fromEntries(
                    sources.validators.map((v) => [
                        v.name,
                        getScriptHashType(v.purpose)
                    ])
                ),
                ...(sources.compilation
                    ? { isTestnet: sources.compilation.isTestnet }
                    : {}),
                allowModuleEntryPoint: true
            }
        )
        if (sources.compilation) {
            if (!validCompilationContext(sources.compilation))
                throw new Error("Invalid captured compilation context")
            for (const [name, cbor] of Object.entries(
                sources.compilation.parameters
            ))
                if (!this.program.changeParam(name, decodeUplcData(cbor)))
                    throw new Error(`Cannot apply captured parameter ${name}`)
        }
    }

    evaluate(expression: string, site: Site, values: CekValue[]) {
        // The nearest binding wins when a name is shadowed.
        const bindings = new Map<string, CekValue>()
        for (const value of values) {
            if (value.name && /^[A-Za-z_][A-Za-z_0-9]*$/.test(value.name))
                bindings.set(value.name, value)
        }
        const context = this.compilation
        const options = context?.unoptimized
        const hashDependencies = { ...options?.hashDependencies }
        if (options?.ownHash && context)
            hashDependencies[context.validator.name] = options.ownHash
        // An empty compiler placeholder is not an actual captured hash.
        for (const [name, hash] of Object.entries(hashDependencies))
            if (hash === "#") delete hashDependencies[name]
        let compiled: ReturnType<Program["compileDebugExpression"]>
        try {
            compiled = this.program.compileDebugExpression(
                expression,
                site,
                [...bindings.keys()],
                { ...options, hashDependencies }
            )
        } catch (error) {
            const missing = /builtin __helios__scripts__(\w+) not found/.exec(
                (error as Error).message
            )
            if (missing)
                throw new Error(
                    `Hash for ${missing[1]} was not captured. Load a capture containing compilation metadata from the updated platform to inspect this expression.`
                )
            throw error
        }
        let root = compiled.program.root
        for (const _ of bindings) {
            if (root.kind != "lambda")
                throw new Error("Invalid expression parameter encoding")
            root = root.expr
        }
        // Bind the fresh expression machine to immutable CEK values, including
        // closures. Never evaluate on or advance the suspended script machine.
        const boundRoot: UplcTerm = Object.create(root)
        boundRoot.compute = (_stack, ctx) =>
            root.compute({ values: [...bindings.values()], callSites: [] }, ctx)
        const machine = makeUplcProgramV2(boundRoot).createCekMachine(undefined)
        for (let i = 0; i < 100_000; i++) {
            const result = machine.step()
            if (result.kind == "error")
                throw new Error(
                    "left" in result.result.result
                        ? result.result.result.left.error
                        : "Evaluation failed"
                )
            if (result.kind == "completed") {
                if (!("right" in result.result.result))
                    throw new Error("Evaluation failed")
                return {
                    type: compiled.type,
                    value: result.result.result.right
                }
            }
        }
        throw new Error("Expression exceeded the 100000-step evaluation limit")
    }
}
