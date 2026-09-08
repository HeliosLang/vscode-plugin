import { test } from "node:test"
import assert from "node:assert/strict"
import { parse } from "jsonc-parser"
import { appendLaunchConfiguration } from "../src/launchConfig"

const minimal = { type: "heliosdebugger", request: "launch", name: "Helios: Run Current" }

test("appends while preserving existing configurations, arguments, comments and version", () => {
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
    const updated = appendLaunchConfiguration(raw, minimal)
    const before = parse(raw)
    assert.deepEqual(parse(updated), { ...before, configurations: [...before.configurations, minimal] })
    assert.ok(updated.includes("// Keep my launch settings"))
    assert.ok(updated.includes("// Another debugger"))
    assert.equal(appendLaunchConfiguration(updated, minimal), updated)
})

test("creates absent or empty configurations and supplies a missing version", () => {
    for (const raw of ["{}", '{"configurations":[]}']) {
        assert.deepEqual(parse(appendLaunchConfiguration(raw, minimal)), {
            version: "0.2.0", configurations: [minimal]
        })
    }
})

test("does not modify malformed JSONC or non-array configurations", () => {
    for (const raw of ['{"configurations":[', '{"configurations":null}', '{"configurations":{}}', '[]', 'null', '']) {
        assert.equal(appendLaunchConfiguration(raw, minimal), raw)
    }
})

test("keeps existing customized minimal configuration byte-for-byte", () => {
    const raw = JSON.stringify({ configurations: [{ ...minimal, args: ["01"] }] })
    assert.equal(appendLaunchConfiguration(raw, minimal), raw)
})
