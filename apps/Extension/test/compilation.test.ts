import { test } from "node:test"
import assert from "node:assert/strict"
import { Program, getScriptHashType } from "@helios-lang/compiler"
import { makeIntData, makeUplcDataValue } from "@helios-lang/uplc"
import { Schema } from "effect"
import { Store, type CompilationContext } from "schemas"
import {
    capturedProgram,
    capturedCompileOptions,
    verifyCompilation
} from "../src/captureCompilation"
import { compileEntryPoint } from "../src/ast"
const source = `minting parameters
const LIMIT: Int = 0
func main(r: Int) -> Bool { r == LIMIT }`
const context: CompilationContext = {
    version: 1,
    compilerVersion: "0.17.30",
    validator: { name: "parameters", purpose: "minting" },
    parameters: { "parameters::LIMIT": "03" },
    isTestnet: false,
    validatorTypes: { parameters: "MintingPolicyHash" },
    optimized: {
        hashDependencies: { parameters: "#" },
        dependsOnOwnHash: false
    },
    unoptimized: {
        hashDependencies: { parameters: "#" },
        dependsOnOwnHash: false
    }
}
test("captured parameters rebuild and persist independently of source defaults", () => {
    const raw = new Program(source, {
        validatorTypes: { parameters: getScriptHashType("minting") }
    })
    const configured = capturedProgram(raw, context)
    const program = compileEntryPoint(configured, "main", context)!
    assert(
        "right" in
            program.eval([
                makeUplcDataValue(makeIntData(3)),
                makeUplcDataValue(makeIntData(0))
            ]).result
    )
    assert(
        "left" in
            program.eval([
                makeUplcDataValue(makeIntData(0)),
                makeUplcDataValue(makeIntData(0))
            ]).result
    )
    const hash = Buffer.from(
        configured.compile(capturedCompileOptions(context, true)).hash()
    ).toString("hex")
    assert(verifyCompilation(raw, context, hash).matches)
    assert(!verifyCompilation(raw, context, "00".repeat(28)).matches)
    const stored = Schema.decodeUnknownSync(Store)(
        JSON.parse(
            JSON.stringify({
                values: {},
                links: {},
                captureContexts: {
                    "file:///validator.hl::main": {
                        captureId: "capture",
                        evaluationIndex: 0,
                        scriptHash: hash,
                        compilation: context
                    }
                }
            })
        )
    )
    assert.deepEqual(
        stored.captureContexts?.["file:///validator.hl::main"].compilation,
        context
    )
    assert.equal(capturedProgram(raw), raw)
    const other = { ...context, parameters: { "parameters::LIMIT": "04" } }
    assert.notDeepEqual(
        capturedProgram(raw, other).compile(true).hash(),
        configured.compile(true).hash()
    )
    assert.throws(
        () =>
            capturedProgram(raw, {
                ...context,
                parameters: { "parameters::MISSING": "03" }
            }),
        /Cannot apply/
    )
    assert.throws(
        () =>
            capturedProgram(raw, {
                ...context,
                parameters: { "parameters::LIMIT": "ff" }
            }),
        /Cannot apply/
    )
    assert.deepEqual(
        Schema.decodeUnknownSync(Store)({ values: {}, links: {} }),
        { values: {}, links: {} }
    )
})
