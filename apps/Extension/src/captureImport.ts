import { type Program } from "@helios-lang/compiler"
import { decodeUplcData } from "@helios-lang/uplc"
import { collectEntryPointInfo } from "./ast"
import { type CaptureEvaluation } from "./captureFeed"

export function capturedArguments(
    ast: Program,
    evaluation: CaptureEvaluation
): { name: string; type: string; cbor: string }[] {
    if (evaluation.plutusVersion !== "PlutusScriptV2")
        throw new Error(
            "Captured argument import currently supports Plutus V2 only"
        )
    const info = collectEntryPointInfo(ast, "main")!
    const expected = ast.purpose === "spending" ? 3 : 2
    if (
        evaluation.arguments.length !== expected ||
        info.args.length !== expected - 1
    )
        throw new Error(
            "Captured arguments do not match the validator's main signature"
        )
    const context = decodeUplcData(evaluation.arguments[expected - 1])
    if (
        context.kind !== "constr" ||
        context.tag !== 0 ||
        context.fields.length !== 2 ||
        context.fields[1].kind !== "constr"
    )
        throw new Error("Invalid captured ScriptContext")
    const purpose = context.fields[1].tag
    const allowed: Record<string, number[]> = {
        spending: [1],
        minting: [0],
        staking: [2, 3],
        rewarding: [2],
        certifying: [3],
        mixed: [0, 1, 2, 3]
    }
    if (!allowed[ast.purpose]?.includes(purpose))
        throw new Error(
            "Captured script purpose does not match the workspace validator"
        )
    const args = info.args.map((arg, i) => ({
        name: arg.name === "_" ? `_captured_${i}` : arg.name,
        type: arg.name === "_" ? "Data" : arg.type,
        cbor: evaluation.arguments[i]
    }))
    args.push({
        name: "ScriptContext",
        type: "ScriptContext",
        cbor: evaluation.arguments[expected - 1]
    })
    return args
}
