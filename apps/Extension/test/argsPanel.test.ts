import { test } from "node:test"
import assert from "node:assert/strict"
import { Program } from "@helios-lang/compiler"
import { collectEntryPointInfo } from "../src/ast"
import { resolveArgumentValues } from "../../ArgsView/src/argumentValues"

test("oracle ignored redeemer does not block the argument panel", () => {
    const ast = new Program(
        "staking oracle_delegate\nfunc main(_) -> Bool { true }"
    )
    const info = collectEntryPointInfo(ast, "main")!
    assert.equal(info.args[0].type, "All")
    assert.equal(info.needsScriptContext, true)
    assert.deepEqual(
        resolveArgumentValues(info.args, {}, () => undefined),
        {}
    )
})

test("multiple ignored arguments do not block named arguments or defaults", () => {
    const args = [
        { name: "_", type: "All", optional: false },
        { name: "_", type: "All", optional: false },
        { name: "redeemer", type: "Int", optional: false }
    ]
    assert.deepEqual(
        resolveArgumentValues(args, {}, (name) =>
            name === "redeemer" ? "1863" : undefined
        ),
        { redeemer: "1863" }
    )
    assert.deepEqual(
        resolveArgumentValues(args, {}, () => undefined),
        { redeemer: "182a" }
    )
    assert.equal(
        resolveArgumentValues(
            [{ name: "x", type: "Unresolved", optional: false }],
            {},
            () => undefined
        ),
        undefined
    )
})
