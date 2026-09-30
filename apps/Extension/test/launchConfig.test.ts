import { test } from "node:test"
import assert from "node:assert/strict"
import { parse } from "jsonc-parser"
import { synchronizeHeliosLaunchConfiguration } from "../src/launchConfig"
import { selectEntryPoint } from "../src/entryPoint"
import { Program, getScriptHashType } from "@helios-lang/compiler"
import { collectValidators } from "../src/ast"

test("debug launches preserve spending, minting, staking and mixed hash types", () => {
    const purposes = {
        spend: "spending",
        mint: "minting",
        stake: "staking",
        mixed: "mixed"
    }
    const validatorTypes = Object.fromEntries(
        Object.entries(purposes).map(([name, purpose]) => [
            name,
            getScriptHashType(purpose)
        ])
    )
    const source = `spending caller
const target: Address = Address::from_validator(Scripts::spend)
func main(_datum: Data, _redeemer: Data) -> Bool { target == target }`
    const program = new Program(source, { validatorTypes })
    const serialized = collectValidators(program)
    assert.deepEqual(
        Object.fromEntries(serialized.map((v) => [v.name, v.purpose])),
        purposes
    )
    assert.doesNotThrow(
        () =>
            new Program(source, {
                validatorTypes: Object.fromEntries(
                    serialized.map((v) => [
                        v.name,
                        getScriptHashType(v.purpose)
                    ])
                )
            })
    )
})

test("defaults to main rather than the first helper, preserving valid selections", () => {
    const entries = ["validate_unlock", "main"]
    assert.equal(selectEntryPoint(entries), "main")
    assert.equal(
        selectEntryPoint(entries, "validate_unlock"),
        "validate_unlock"
    )
    assert.equal(selectEntryPoint(entries, "removed"), "main")
    assert.equal(selectEntryPoint(["helper"]), "helper")
    assert.equal(selectEntryPoint([]), undefined)
})

const minimal = {
    type: "heliosdebugger",
    request: "launch",
    name: "Helios: Run Current"
}

test("aggressively replaces Helios configurations while preserving other debuggers", () => {
    const raw = `{
  // Keep my launch settings
  "version": "custom",
  "configurations": [
    {"type":"heliosdebugger","request":"launch","name":"Time lock: successful Unlock","args":["01","02","03"]},
    // Another debugger
    {"type":"node","request":"launch","name":"Node","program":"index.js"},
  ],
  "compounds": [{"name":"Both","configurations":["Node"]}]
}`
    const updated = synchronizeHeliosLaunchConfiguration(raw, minimal)
    assert.deepEqual(parse(updated), {
        version: "custom",
        configurations: [
            minimal,
            {
                type: "node",
                request: "launch",
                name: "Node",
                program: "index.js"
            }
        ],
        compounds: [{ name: "Both", configurations: ["Node"] }]
    })
    assert.ok(updated.includes("// Keep my launch settings"))
    assert.ok(updated.includes("// Another debugger"))
    assert.deepEqual(
        parse(synchronizeHeliosLaunchConfiguration(updated, minimal)),
        parse(updated)
    )
})

test("creates absent or empty configurations and supplies a missing version", () => {
    for (const raw of ["{}", '{"configurations":[]}']) {
        assert.deepEqual(
            parse(synchronizeHeliosLaunchConfiguration(raw, minimal)),
            { version: "0.2.0", configurations: [minimal] }
        )
    }
})

test("does not modify malformed JSONC or non-array configurations", () => {
    for (const raw of [
        '{"configurations":[',
        '{"configurations":null}',
        '{"configurations":{}}',
        "[]",
        "null",
        ""
    ]) {
        assert.equal(synchronizeHeliosLaunchConfiguration(raw, minimal), raw)
    }
})

test("removes duplicate and legacy Helios entries including stale arguments", () => {
    const raw = JSON.stringify({
        configurations: [
            { ...minimal, args: ["01"], stopOnEntry: true },
            { type: "helios", request: "launch", name: "Old" },
            minimal
        ]
    })
    assert.deepEqual(
        parse(synchronizeHeliosLaunchConfiguration(raw, minimal)),
        {
            version: "0.2.0",
            configurations: [minimal]
        }
    )
})
