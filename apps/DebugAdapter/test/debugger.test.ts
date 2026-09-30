import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawn } from "node:child_process"
import { Program, getScriptHashType } from "@helios-lang/compiler"
import { makeSource } from "@helios-lang/compiler-utils"
import { bytesToHex } from "@helios-lang/codec-utils"
import {
    makeUplcDataValue,
    encodeFullUplcProgram,
    makeListData,
    makeIntData,
    makeUplcInt,
    makeByteArrayData,
    makeConstrData
} from "@helios-lang/uplc"
import { HeliosDebugSession } from "../src/session"
import { ExpressionEvaluator } from "../src/expressions"

const content = `testing stepping
func add(x: Int) -> Int {
    y = x + 1;
    y * 2
}
func main() -> Int {
    a = 3;
    b = add(a);
    b + 4
}`
const file = "/tmp/stepping.hl"
const sources = { main: { name: file, content }, modules: [], validators: [] }

function harness() {
    const session: any = new HeliosDebugSession()
    const events: any[] = []
    let response: any
    session.sendEvent = (event: any) => events.push(event)
    session.sendResponse = (value: any) => {
        response = value
    }
    const request = (command: string, args: any = {}) => {
        response = undefined
        session[command + "Request"](
            {
                command,
                success: true,
                seq: 0,
                request_seq: 0,
                type: "response"
            },
            args
        )
        return response
    }
    request("initialize", { linesStartAt1: true, columnsStartAt1: true })
    return {
        session,
        events,
        request,
        async stop() {
            for (let i = 0; i < 1000; i++) {
                const found = events.findIndex(
                    (e) => e.event == "stopped" || e.event == "terminated"
                )
                if (found >= 0) return events.splice(found, 1)[0]
                await new Promise((resolve) => setImmediate(resolve))
            }
            throw new Error("No debugger stop")
        }
    }
}

function launch(
    h: ReturnType<typeof harness>,
    source = content,
    stopOnEntry = false
) {
    const p = new Program(makeSource(source, { name: file })).compile(false)
    const response = h.request("launch", {
        uplcProgram: bytesToHex(encodeFullUplcProgram(p)),
        args: [],
        stopOnEntry,
        debugSources: { ...sources, main: { name: file, content: source } }
    })
    assert.equal(response.success, true, response.message)
    h.request("configurationDone")
}

test("Helios expressions use lexical types and runtime values", () => {
    const p = new Program(makeSource(content, { name: file })).compile(false)
    const machine = p.createCekMachine([])
    const evaluator = new ExpressionEvaluator(sources)
    let checked = false
    for (let i = 0; i < 10000; i++) {
        const s = machine.snapshot()
        if (
            s.currentTerm?.site?.line == 3 &&
            s.stack?.values.some((v) => v.name == "y")
        ) {
            const result = evaluator.evaluate(
                "y + x",
                s.currentTerm.site,
                s.stack.values
            )
            assert.equal(String(result.value), "7")
            assert.equal(result.type, "Int")
            assert.equal(
                String(
                    evaluator.evaluate(
                        "y == 4 && x == 3",
                        s.currentTerm.site,
                        s.stack.values
                    ).value
                ),
                "true"
            )
            assert.throws(() =>
                evaluator.evaluate(
                    "missing + 1",
                    s.currentTerm!.site!,
                    s.stack!.values
                )
            )
            checked = true
            break
        }
        if (machine.step().kind != "running") break
    }
    assert.ok(checked)
})

test("breakpoints, frames, scope handles, stepping and completion", async () => {
    const h = harness()
    h.request("setBreakPoints", {
        source: { path: file },
        breakpoints: [{ line: 4 }, { line: 9 }]
    })
    launch(h)
    assert.equal((await h.stop()).body.reason, "breakpoint")
    const trace = h.request("stackTrace", {}).body
    assert.equal(trace.stackFrames[0].line, 4)
    assert.equal(trace.stackFrames[0].column, 7)
    assert.equal(trace.totalFrames, 2)
    assert.equal(
        h.request("stackTrace", { startFrame: 1, levels: 1 }).body
            .stackFrames[0].id,
        2
    )
    const scopes = h.request("scopes", { frameId: 1 }).body.scopes
    h.request("scopes", { frameId: 2 })
    const variables = h.request("variables", {
        variablesReference: scopes[0].variablesReference
    }).body.variables
    assert.ok(variables.some((v: any) => v.name == "y"))
    const evaluated = h.request("evaluate", { expression: "y + x", frameId: 1 })
    assert.equal(evaluated.success, true, evaluated.message)
    assert.equal(evaluated.body.result, "7")
    h.request("continue")
    assert.equal((await h.stop()).body.reason, "breakpoint")
    assert.equal(h.request("stackTrace").body.stackFrames[0].line, 9)
    h.request("continue")
    assert.equal((await h.stop()).event, "terminated")
})

test("conditional breakpoints evaluate Bool and skip false", async () => {
    const h = harness()
    h.request("setBreakPoints", {
        source: { path: file },
        breakpoints: [
            { line: 4, condition: "y == 5" },
            { line: 9, condition: "b == 8" }
        ]
    })
    launch(h)
    assert.equal((await h.stop()).body.reason, "breakpoint")
    assert.equal(h.request("stackTrace").body.stackFrames[0].line, 9)
    assert.ok(
        !h.events.some(
            (e) => e.event == "output" && e.body.category == "stderr"
        )
    )
})

test("step out resumes the caller without revisiting the function header", async () => {
    const h = harness()
    h.request("setBreakPoints", {
        source: { path: file },
        breakpoints: [{ line: 4 }]
    })
    launch(h)
    await h.stop()
    h.request("stepOut")
    assert.equal((await h.stop()).body.reason, "step")
    const frame = h.request("stackTrace").body.stackFrames[0]
    assert.equal(frame.line, 9)
})

test("step in and over follow source expressions", async () => {
    for (const command of ["stepIn", "next"]) {
        const h = harness()
        h.request("setBreakPoints", {
            source: { path: file },
            breakpoints: [{ line: 8, column: 12 }]
        })
        launch(h)
        await h.stop()
        h.request("setBreakPoints", { source: { path: file }, breakpoints: [] })
        const positions: number[][] = []
        for (let i = 0; i < 20; i++) {
            h.request(command)
            if ((await h.stop()).event == "terminated") break
            const f = h.request("stackTrace").body.stackFrames[0]
            positions.push([f.line, f.column])
        }
        assert.ok(!positions.some(([line]) => line == 2 || line == 6))
        if (command == "stepIn")
            assert.ok(positions.some(([line]) => line == 3))
        else assert.ok(!positions.some(([line]) => line == 3 || line == 4))
    }
})

test("time_lock acceptance trace and typed struct expressions", async () => {
    const file = resolve("test/fixtures/time_lock.hl")
    const content = readFileSync(file, "utf8")
    const contextSource = `testing context
    import { new_spending } from ScriptContext
    func main() -> Data {
        id = TxOutputId::new(TxId::new(#${"00".repeat(32)}), 0);
        new_spending(Tx::new(
            []TxInput{}, []TxInput{}, []TxOutput{}, Value::ZERO, Value::ZERO,
            []DCert{}, Map[StakingCredential]Int{},
            TimeRange::from(Time::new(2000)),
            []PubKeyHash{PubKeyHash::new(#${"22".repeat(28)})},
            Map[ScriptPurpose]Int{}, Map[DatumHash]Data{},
            TxId::new(#${"00".repeat(32)})
        ), id)
    }`
    const contextResult = new Program(contextSource)
        .compile(false)
        .eval([]).result
    assert.ok(
        "right" in contextResult &&
            typeof contextResult.right != "string" &&
            contextResult.right.kind == "data"
    )
    if (
        !("right" in contextResult) ||
        typeof contextResult.right == "string" ||
        contextResult.right.kind != "data"
    )
        return
    const args = [
        makeListData([
            makeIntData(1000),
            makeByteArrayData("11".repeat(28)),
            makeByteArrayData("22".repeat(28))
        ]),
        makeConstrData(1, []),
        contextResult.right.value
    ]
    const p = new Program(makeSource(content, { name: file })).compile(false)
    const h = harness()
    h.request("setBreakPoints", {
        source: { path: file },
        breakpoints: [{ line: 17 }, { line: 18 }]
    })
    const response = h.request("launch", {
        uplcProgram: bytesToHex(encodeFullUplcProgram(p)),
        args: args.map((a) => bytesToHex(a.toCbor())),
        debugSources: {
            main: { name: file, content },
            modules: [],
            validators: []
        }
    })
    assert.equal(response.success, true, response.message)
    h.request("configurationDone")
    assert.equal((await h.stop()).body.reason, "breakpoint")
    const trace = h.request("stackTrace").body
    assert.deepEqual(
        trace.stackFrames.map((f: any) => [f.name, f.line, f.column]),
        [
            ["validate_unlock", 17, 11],
            ["main", 28, 28]
        ]
    )
    const scopes = h.request("scopes", { frameId: 1 }).body.scopes
    const locals = h.request("variables", {
        variablesReference: scopes[0].variablesReference
    }).body.variables
    assert.deepEqual(
        locals.map((v: any) => v.name),
        ["datum", "now"]
    )
    assert.equal(locals[1].value, "integer 2000")
    assert.equal(
        h.request("variables", {
            variablesReference: locals[0].variablesReference
        }).body.variables[0].value,
        "(I 1000)"
    )
    for (const expression of [
        "now > datum.lock_until",
        "datum.beneficiary == PubKeyHash::new(#" + "22".repeat(28) + ")",
        "tx.is_signed_by(datum.beneficiary)"
    ]) {
        const result = h.request("evaluate", { expression })
        assert.equal(result.success, true, result.message)
        assert.equal(result.body.result, "true")
    }
    assert.equal(
        h.request("evaluate", {
            expression: "now > datum.lock_until",
            frameId: 2
        }).body.result,
        "true"
    )
    const callerScopes = h.request("scopes", { frameId: 2 }).body.scopes
    assert.deepEqual(
        h
            .request("variables", {
                variablesReference: callerScopes[0].variablesReference
            })
            .body.variables.map((v: any) => v.name),
        ["validate_unlock", "datum", "redeemer", "now"]
    )
    const positions = []
    for (let i = 0; i < 4; i++) {
        h.request("stepIn")
        assert.equal((await h.stop()).body.reason, "step")
        const frame = h.request("stackTrace").body.stackFrames[0]
        positions.push([frame.line, frame.column])
    }
    assert.deepEqual(positions, [
        [17, 5],
        [17, 16],
        [17, 12],
        [17, 23]
    ])
    h.request("continue")
    assert.equal((await h.stop()).body.reason, "breakpoint")
    assert.deepEqual(
        h
            .request("stackTrace")
            .body.stackFrames.map((f: any) => [f.name, f.line, f.column]),
        [
            ["validate_unlock", 18, 11],
            ["main", 28, 28]
        ]
    )
    h.request("continue")
    assert.equal((await h.stop()).event, "terminated")
    assert.ok(
        !h.events.some(
            (e) => e.event == "output" && e.body.output.includes("Error")
        )
    )
})

test("local closures run in an isolated expression machine", async () => {
    const h = harness()
    h.request("setBreakPoints", {
        source: { path: file },
        breakpoints: [{ line: 5 }]
    })
    launch(
        h,
        `testing closure
func main() -> Int {
    x = 3;
    f = (y: Int) -> Int { x + y };
    f(4)
}`
    )
    await h.stop()
    const before = h.request("stackTrace").body
    assert.equal(h.request("evaluate", { expression: "f(5)" }).body.result, "8")
    assert.equal(
        h.request("evaluate", { expression: "f(false)" }).success,
        false
    )
    assert.equal(h.request("evaluate", { expression: "f(6)" }).body.result, "9")
    assert.deepEqual(h.request("stackTrace").body, before)
    h.request("continue")
    assert.equal((await h.stop()).event, "terminated")
    assert.ok(
        h.events.some((e) => e.event == "output" && e.body.output == "(I 7)"),
        JSON.stringify(h.events)
    )
})

test("entry stops, unexecutable lines, and bad conditions are explicit", async () => {
    const h = harness()
    launch(h, content, true)
    assert.equal((await h.stop()).body.reason, "entry")
    const bp = h.request("setBreakPoints", {
        source: { path: file },
        breakpoints: [{ line: 2 }, { line: 4, condition: "y + 1" }]
    }).body.breakpoints
    assert.equal(bp[0].verified, false)
    assert.equal(bp[1].verified, true)
    h.request("continue")
    assert.equal((await h.stop()).body.reason, "breakpoint")
    assert.ok(
        h.events.some(
            (e) =>
                e.event == "output" &&
                e.body.output.includes("must return Bool")
        )
    )
    h.request("continue")
    assert.equal((await h.stop()).event, "terminated")
    assert.equal(h.request("evaluate", { expression: "1 + 1" }).success, false)
})

test("source columns after non-BMP characters use VS Code UTF-16 offsets", async () => {
    const source = `testing unicode\nfunc main() -> Int { print("😀"); 1 + 2 }`
    const column = source.split("\n")[1].indexOf("+") + 1
    const h = harness()
    h.request("setBreakPoints", {
        source: { path: file },
        breakpoints: [{ line: 2, column }]
    })
    launch(h, source)
    assert.equal((await h.stop()).body.reason, "breakpoint")
    assert.equal(h.request("stackTrace").body.stackFrames[0].column, column)
})

test("a recursive call can hit the same source-line breakpoint again", async () => {
    const h = harness()
    h.request("setBreakPoints", {
        source: { path: file },
        breakpoints: [{ line: 2 }]
    })
    launch(
        h,
        `testing recursive
func loop(n: Int) -> Int { if (n == 0) { 0 } else { loop(n - 1) } }
func main() -> Int { loop(3) }`
    )
    for (const n of [3, 2, 1, 0]) {
        assert.equal((await h.stop()).body.reason, "breakpoint")
        const result = h.request("evaluate", { expression: "n" })
        assert.equal(result.success, true, result.message)
        assert.equal(result.body.result, String(n))
        const scope = h.request("scopes", { frameId: 1 }).body.scopes[0]
        const variables = h.request("variables", {
            variablesReference: scope.variablesReference
        }).body.variables
        assert.deepEqual(
            variables
                .filter((v: any) => v.name == "n")
                .map((v: any) => v.value),
            [`integer ${n}`]
        )
        h.request("continue")
    }
    assert.equal((await h.stop()).event, "terminated")
})

test("variable scopes hide shadowed user bindings and preserve internal entries", () => {
    const h = harness()
    const values = [
        { name: "n", value: makeUplcInt(3) },
        { name: "__internal", value: makeUplcInt(10) },
        { name: "n", value: makeUplcInt(2) },
        { name: "__internal", value: makeUplcInt(20) }
    ]
    const variables = h.session.stackVariables(values)
    assert.deepEqual(
        variables.user.map((v: any) => [v.name, v.value]),
        [["n", "integer 2"]]
    )
    assert.equal(variables.internal.length, 2)
    assert.equal(values.length, 4)
})

test("recursive argument scopes show only the nearest binding in each frame", async () => {
    const h = harness()
    h.request("setBreakPoints", {
        source: { path: file },
        breakpoints: [{ line: 3 }]
    })
    launch(
        h,
        `testing recursive_arguments
func loop(n: Int, total: Int) -> Int {
    if (n == 0) { total } else { loop(n - 1, total + n) }
}
func main() -> Int { loop(3, 0) }`
    )
    for (const n of [3, 2, 1, 0]) {
        assert.equal((await h.stop()).body.reason, "breakpoint")
        assert.equal(evaluated(h, "n"), String(n))
        const frames = h.request("stackTrace").body.stackFrames
        for (const frame of frames.filter((f: any) => f.name == "loop")) {
            const scope = h.request("scopes", { frameId: frame.id }).body
                .scopes[0]
            const variables = h.request("variables", {
                variablesReference: scope.variablesReference
            }).body.variables
            assert.deepEqual(
                variables.map((v: any) => [v.name, v.value]),
                ["n", "total"].map((name) => [
                    name,
                    `integer ${evaluated(h, name, frame.id)}`
                ])
            )
            assert.equal(scope.namedVariables, 2)
        }
        h.request("continue")
    }
    assert.equal((await h.stop()).event, "terminated")
})

test("stepping through recursive calls does not duplicate argument names", async () => {
    const h = harness()
    launch(
        h,
        `testing recursive_steps
func loop(items: []Int, total: Int) -> Int {
    if (items.is_empty()) { total } else {
        item = items.head;
        quantity = item + total;
        if (quantity > 100) { quantity } else { loop(items.tail, total) }
    }
}
func main() -> Int { loop([]Int{3, 2, 1}, 0) }`,
        true
    )
    for (let steps = 0; steps < 100; steps++) {
        if ((await h.stop()).event == "terminated") return
        const frames = h.request("stackTrace").body.stackFrames
        for (const frame of frames) {
            const scope = h.request("scopes", { frameId: frame.id }).body
                .scopes[0]
            const variables = h.request("variables", {
                variablesReference: scope.variablesReference
            }).body.variables
            const names = variables.map((v: any) => v.name)
            assert.equal(
                new Set(names).size,
                names.length,
                JSON.stringify(variables)
            )
        }
        h.request("stepIn")
    }
    assert.fail("Recursive stepping did not terminate")
})

type DemoToken = { policy: string; name: string; quantity: number }
const demoPolicy = "33".repeat(28)
const demoTokens: (DemoToken | undefined)[] = [
    undefined,
    { policy: demoPolicy, name: "4f54484552", quantity: 1 },
    { policy: demoPolicy, name: "44454d4f", quantity: 1 }
]

function assetDemo(tokens = demoTokens, cancel = false) {
    const folder = resolve("../../examples")
    const main = {
        name: resolve(folder, "time_lock.hl"),
        content: readFileSync(resolve(folder, "time_lock.hl"), "utf8")
            .replace(
                "MintingPolicyHash::new(#)",
                `MintingPolicyHash::new(#${demoPolicy})`
            )
            .replace("#00\n)", "#44454d4f\n)")
    }
    const module = {
        name: resolve(folder, "asset_search.hl"),
        content: readFileSync(resolve(folder, "asset_search.hl"), "utf8")
    }
    const program = new Program(makeSource(main.content, { name: main.name }), {
        moduleSources: [makeSource(module.content, { name: module.name })]
    }).compile(false)
    const inputs = tokens.map((token, i) => {
        const value = token
            ? `Value::lovelace(2000000) + Value::new(AssetClass::new(MintingPolicyHash::new(#${token.policy}), #${token.name}), ${token.quantity})`
            : "Value::lovelace(2000000)"
        return `TxInput::new(TxOutputId::new(id, ${i}), TxOutput::new(address, ${value}, TxOutputDatum::new_none()))`
    })
    const context = new Program(`testing context
import { new_spending } from ScriptContext
func main() -> Data {
    id = TxId::new(#${"00".repeat(32)});
    ${inputs.length ? `address = Address::new(SpendingCredential::new_pubkey(PubKeyHash::new(#${"00".repeat(28)})), Option[StakingCredential]::None);` : ""}
    new_spending(Tx::new(
        []TxInput{${inputs.join(", ")}}, []TxInput{}, []TxOutput{}, Value::ZERO, Value::ZERO,
        []DCert{}, Map[StakingCredential]Int{}, TimeRange::from(Time::new(2000)),
        []PubKeyHash{PubKeyHash::new(#${(cancel ? "11" : "22").repeat(28)})},
        Map[ScriptPurpose]Int{}, Map[DatumHash]Data{}, id
    ), TxOutputId::new(id, 0))
}`)
        .compile(false)
        .eval([]).result
    assert.ok(
        "right" in context &&
            typeof context.right != "string" &&
            context.right.kind == "data"
    )
    const args = [
        makeListData([
            makeIntData(1000),
            makeByteArrayData("11".repeat(28)),
            makeByteArrayData("22".repeat(28))
        ]),
        makeConstrData(cancel ? 0 : 1, []),
        context.right.value
    ]
    return {
        main,
        module,
        launch(h: ReturnType<typeof harness>) {
            h.request("setExceptionBreakPoints", { filters: [] })
            const response = h.request("launch", {
                uplcProgram: bytesToHex(encodeFullUplcProgram(program)),
                args: args.map((a) => bytesToHex(a.toCbor())),
                debugSources: { main, modules: [module], validators: [] }
            })
            assert.equal(response.success, true, response.message)
            h.request("configurationDone")
        }
    }
}

function evaluated(
    h: ReturnType<typeof harness>,
    expression: string,
    frameId = 1
) {
    const response = h.request("evaluate", { expression, frameId })
    assert.equal(response.success, true, response.message)
    return response.body.result
}

test("asset search demo: recursive module breakpoints and caller scopes", async () => {
    const demo = assetDemo()
    const h = harness()
    h.request("setBreakPoints", {
        source: { path: demo.module.name },
        breakpoints: [{ line: 9 }]
    })
    demo.launch(h)
    for (const [remaining, quantity] of [
        [3, 0],
        [2, 0],
        [1, 1]
    ]) {
        assert.equal((await h.stop()).body.reason, "breakpoint")
        const frames = h.request("stackTrace").body.stackFrames
        assert.equal(frames[0].source.path, demo.module.name)
        assert.equal(frames[0].line, 9)
        assert.equal(evaluated(h, "inputs.length"), String(remaining))
        assert.equal(evaluated(h, "quantity"), String(quantity))
        assert.equal(
            evaluated(h, "input.output_id.index"),
            String(3 - remaining)
        )
        assert.equal(
            evaluated(h, "input.output.value.get_safe(asset)"),
            String(quantity)
        )
        const caller = frames.find((f: any) => f.name == "validate_unlock")
        assert.ok(caller)
        assert.equal(caller.source.path, demo.main.name)
        assert.equal(evaluated(h, "now > datum.lock_until", caller.id), "true")
        const recursive = frames.filter((f: any) => f.name == "contains_asset")
        assert.deepEqual(
            recursive.map((f: any) => evaluated(h, "inputs.length", f.id)),
            Array.from({ length: 4 - remaining }, (_, i) =>
                String(remaining + i)
            )
        )
        assert.deepEqual(
            recursive.map((f: any) => evaluated(h, "quantity", f.id)),
            [
                String(quantity),
                ...Array.from({ length: 3 - remaining }, () => "0")
            ]
        )
        assert.deepEqual(
            frames.map((f: any) => [f.name, f.line, f.column]),
            [
                ["contains_asset", 9, 9],
                ...Array.from({ length: 3 - remaining }, () => [
                    "contains_asset",
                    12,
                    27
                ]),
                ["validate_unlock", 25, 26],
                ["main", 35, 28]
            ]
        )
        if (remaining == 3) {
            const scope = h.request("scopes", { frameId: 1 }).body.scopes[0]
            assert.deepEqual(
                h
                    .request("variables", {
                        variablesReference: scope.variablesReference
                    })
                    .body.variables.map((v: any) => v.name),
                ["inputs", "asset", "input", "quantity"]
            )
        }
        h.request("continue")
    }
    assert.equal((await h.stop()).event, "terminated")
    assert.ok(
        !h.events.some(
            (e) => e.event == "output" && e.body.output.includes("Error")
        )
    )
})

test("asset search demo: conditional breakpoint and empty-list failure", async () => {
    for (const match of [true, false]) {
        const demo = assetDemo(match ? demoTokens : demoTokens.slice(0, 2))
        const h = harness()
        h.request("setBreakPoints", {
            source: { path: demo.module.name },
            breakpoints: [{ line: 9, condition: "quantity > 0" }, { line: 5 }]
        })
        demo.launch(h)
        assert.equal((await h.stop()).body.reason, "breakpoint")
        const frame = h.request("stackTrace").body.stackFrames[0]
        assert.equal(frame.line, match ? 9 : 5)
        assert.equal(evaluated(h, "inputs.length"), match ? "1" : "0")
        assert.equal(frame.column, 9)
        if (!match) {
            const scope = h.request("scopes", { frameId: 1 }).body.scopes[0]
            assert.deepEqual(
                h
                    .request("variables", {
                        variablesReference: scope.variablesReference
                    })
                    .body.variables.map((v: any) => v.name),
                ["inputs", "asset"]
            )
        }
        h.request("continue")
        assert.equal((await h.stop()).event, "terminated")
        if (match) {
            assert.ok(
                !h.events.some(
                    (e) =>
                        e.event == "output" && e.body.output.includes("Error")
                )
            )
        }
        assert.equal(
            h.events.some(
                (e) =>
                    e.event == "output" &&
                    e.body.output.includes("required asset not found")
            ),
            !match
        )
    }
})

test("asset search demo: false condition skips all inputs", async () => {
    const demo = assetDemo()
    const h = harness()
    h.request("setBreakPoints", {
        source: { path: demo.module.name },
        breakpoints: [{ line: 9, condition: "quantity > 1" }]
    })
    demo.launch(h)
    assert.equal((await h.stop()).event, "terminated")
    assert.ok(
        !h.events.some(
            (e) => e.event == "output" && e.body.output.includes("Error")
        )
    )
})

test("asset search demo: step from validator into imported module", async () => {
    const demo = assetDemo()
    const h = harness()
    h.request("setBreakPoints", {
        source: { path: demo.main.name },
        breakpoints: [{ line: 25 }]
    })
    demo.launch(h)
    assert.equal((await h.stop()).body.reason, "breakpoint")
    const positions: [string, number, number][] = []
    for (let i = 0; i < 40; i++) {
        const frame = h.request("stackTrace").body.stackFrames[0]
        positions.push([
            frame.source.path == demo.main.name ? "validator" : "module",
            frame.line,
            frame.column
        ])
        if (frame.source.path == demo.module.name) break
        h.request("stepIn")
        assert.equal((await h.stop()).body.reason, "step")
    }
    assert.equal(positions.at(-1)?.[0], "module")
    assert.deepEqual(positions, [
        ["validator", 25, 11],
        ["validator", 25, 5],
        ["validator", 25, 26],
        ["validator", 25, 12],
        ["validator", 25, 29],
        ["validator", 25, 30],
        ["validator", 25, 27],
        ["validator", 25, 38],
        ["module", 4, 5]
    ])
    h.request("setBreakPoints", {
        source: { path: demo.main.name },
        breakpoints: []
    })
    h.request("continue")
    assert.equal((await h.stop()).event, "terminated")
})

test("asset search demo: first/last match, absent policy/name, zero, empty, and Cancel", async () => {
    const cases: [(DemoToken | undefined)[], boolean, boolean][] = [
        [demoTokens, true, false],
        [[demoTokens[2], ...demoTokens.slice(0, 2)], true, false],
        [
            [{ policy: "44".repeat(28), name: "44454d4f", quantity: 1 }],
            false,
            false
        ],
        [[demoTokens[1]], false, false],
        [[{ policy: demoPolicy, name: "44454d4f", quantity: 0 }], false, false],
        [[], false, false],
        [[], true, true]
    ]
    for (const [tokens, success, cancel] of cases) {
        const demo = assetDemo(tokens, cancel)
        const h = harness()
        demo.launch(h)
        assert.equal((await h.stop()).event, "terminated")
        if (success) {
            assert.ok(
                !h.events.some(
                    (e) =>
                        e.event == "output" && e.body.output.includes("Error")
                )
            )
        }
        assert.equal(
            h.events.some(
                (e) =>
                    e.event == "output" &&
                    e.body.output.includes("required asset not found")
            ),
            !success
        )
    }
})

test(
    "DAP over stdio negotiates coordinates and evaluates while suspended",
    { timeout: 10000 },
    async () => {
        const child = spawn(
            process.execPath,
            [process.env.HELIOS_TEST_ADAPTER!],
            { stdio: ["pipe", "pipe", "pipe"] }
        )
        const messages: any[] = []
        let buffer = Buffer.alloc(0)
        let seq = 0
        let stderr = ""
        child.stderr.on("data", (data) => {
            stderr += data
        })
        child.stdout.on("data", (data) => {
            buffer = Buffer.concat([buffer, data])
            while (true) {
                const end = buffer.indexOf("\r\n\r\n")
                if (end < 0) break
                const length = Number(
                    /Content-Length: (\d+)/i.exec(
                        buffer.subarray(0, end).toString()
                    )?.[1]
                )
                if (buffer.length < end + 4 + length) break
                messages.push(
                    JSON.parse(
                        buffer.subarray(end + 4, end + 4 + length).toString()
                    )
                )
                buffer = buffer.subarray(end + 4 + length)
            }
        })
        const waitFor = async (predicate: (m: any) => boolean) => {
            const start = Date.now()
            while (Date.now() - start < 5000) {
                const i = messages.findIndex(predicate)
                if (i >= 0) return messages.splice(i, 1)[0]
                await new Promise((resolve) => setTimeout(resolve, 5))
            }
            throw new Error(
                `No DAP response: ${stderr}; messages: ${JSON.stringify(messages)}`
            )
        }
        const request = async (command: string, args: any = {}) => {
            const id = ++seq
            const body = JSON.stringify({
                seq: id,
                type: "request",
                command,
                arguments: args
            })
            child.stdin.write(
                `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
            )
            const response = await waitFor(
                (m) => m.type == "response" && m.request_seq == id
            )
            assert.equal(response.success, true, response.message)
            return response.body
        }
        try {
            const caps = await request("initialize", {
                adapterID: "heliosdebugger",
                pathFormat: "path",
                linesStartAt1: false,
                columnsStartAt1: false
            })
            assert.equal(caps.supportsConditionalBreakpoints, true)
            await waitFor((m) => m.event == "initialized")
            await request("setBreakpoints", {
                source: { path: file },
                breakpoints: [{ line: 3 }]
            })
            const p = new Program(makeSource(content, { name: file })).compile(
                false
            )
            await request("launch", {
                uplcProgram: bytesToHex(encodeFullUplcProgram(p)),
                args: [],
                debugSources: sources
            })
            await request("configurationDone")
            const stop = await waitFor((m) => m.event == "stopped")
            assert.deepEqual(stop.body.hitBreakpointIds, [1])
            const trace = await request("stackTrace", { threadId: 1 })
            assert.equal(trace.stackFrames[0].line, 3)
            assert.equal(trace.stackFrames[0].column, 6)
            assert.equal(
                (
                    await request("evaluate", {
                        expression: "y + x",
                        frameId: 1,
                        context: "repl"
                    })
                ).result,
                "7"
            )
            await request("continue", { threadId: 1 })
            await waitFor((m) => m.event == "terminated")
            await request("disconnect")
        } finally {
            child.kill()
        }
    }
)

test("script failures pause with frames and variables until continued", async () => {
    const h = harness()
    const source = `testing failure
func check(x: Int) -> Int {
    assert(x > 0, "positive required");
    x
}
func main() -> Int { check(-1) }`
    launch(h, source)
    const stopped = await h.stop()
    assert.equal(stopped.body.reason, "exception")
    const frames = h.request("stackTrace", { threadId: 1 }).body.stackFrames
    assert.ok(frames.some((f: any) => f.name === "check"))
    assert.equal(frames[0].line, 3)
    const scopes = h.request("scopes", { frameId: frames[0].id }).body.scopes
    const variables = h.request("variables", {
        variablesReference: scopes[0].variablesReference
    }).body.variables
    assert.ok(
        variables.some((v: any) => v.name === "x" && v.value.includes("-1"))
    )
    assert.equal(
        h.request("exceptionInfo").body.exceptionId,
        "HeliosScriptError"
    )
    assert.equal(
        h.request("evaluate", { expression: "x", frameId: frames[0].id }).body
            .result,
        "-1"
    )
    h.request("continue")
    assert.equal((await h.stop()).event, "terminated")
})

test("script exception stops can be disabled", async () => {
    const h = harness()
    h.request("setExceptionBreakPoints", { filters: [] })
    launch(h, 'testing failure\nfunc main() -> () { error("failure") }')
    assert.equal((await h.stop()).event, "terminated")
})

test("watch expressions use captured compile-time parameters", () => {
    const text = `minting parameter_watch
const LIMIT: Int = 0
func main(r: Int) -> Bool {
    n = r + 1;
    n == LIMIT
}`
    const source = makeSource(text, { name: file })
    const program = new Program(source)
    program.changeParam("parameter_watch::LIMIT", makeIntData(3))
    const machine = program
        .compile(false)
        .createCekMachine([
            makeUplcDataValue(makeIntData(2)),
            makeUplcDataValue(makeIntData(0))
        ])
    const options = {
        hashDependencies: { parameter_watch: "#" },
        dependsOnOwnHash: false
    }
    const evaluator = new ExpressionEvaluator({
        main: { name: file, content: text },
        modules: [],
        validators: [{ name: "parameter_watch", purpose: "minting" }],
        compilation: {
            version: 1,
            compilerVersion: "0.17.30",
            validator: { name: "parameter_watch", purpose: "minting" },
            parameters: { "parameter_watch::LIMIT": "03" },
            isTestnet: false,
            validatorTypes: { parameter_watch: "MintingPolicyHash" },
            optimized: options,
            unoptimized: options
        }
    })
    let checked = false
    for (let i = 0; i < 10000; i++) {
        const snapshot = machine.snapshot()
        if (
            snapshot.currentTerm?.site?.line === 4 &&
            snapshot.stack?.values.some((v) => v.name === "n")
        ) {
            const result = evaluator.evaluate(
                "LIMIT == 3 && n == LIMIT",
                snapshot.currentTerm.site,
                snapshot.stack.values
            )
            assert.equal(String(result.value), "true")
            checked = true
            break
        }
        if (machine.step().kind !== "running") break
    }
    assert(checked)
})

test("watch expressions use captured hashes in imported addresses and reject unavailable hashes", () => {
    const text = `minting hash_watch
import Addresses
func main(r: Int) -> Bool {
    n = r + 1;
    n == 3
}`
    const moduleText = `module Addresses
const config: Address = Address::from_validator(Scripts::config_validator)`
    const hash = "22".repeat(28)
    const ownHash = "33".repeat(28)
    const base = {
        main: { name: file, content: text },
        modules: [{ name: "/tmp/Addresses.hl", content: moduleText }],
        validators: [
            { name: "hash_watch", purpose: "minting" },
            { name: "config_validator", purpose: "spending" }
        ]
    }
    const compilation = {
        version: 1 as const,
        compilerVersion: "0.17.30",
        validator: { name: "hash_watch", purpose: "minting" },
        parameters: {},
        isTestnet: false,
        validatorTypes: {
            hash_watch: "MintingPolicyHash",
            config_validator: "ValidatorHash"
        },
        optimized: {
            hashDependencies: { config_validator: "11".repeat(28) },
            dependsOnOwnHash: false
        },
        unoptimized: {
            hashDependencies: { config_validator: `#${hash}` },
            dependsOnOwnHash: false,
            ownHash
        }
    }
    const evaluator = new ExpressionEvaluator({ ...base, compilation })
    const missing = new ExpressionEvaluator(base)
    const placeholder = new ExpressionEvaluator({
        ...base,
        compilation: {
            ...compilation,
            unoptimized: {
                ...compilation.unoptimized,
                hashDependencies: { config_validator: "#" }
            }
        }
    })
    const program = new Program(makeSource(text, { name: file }), {
        moduleSources: [makeSource(moduleText, { name: "/tmp/Addresses.hl" })],
        validatorTypes: Object.fromEntries(
            base.validators.map((v) => [v.name, getScriptHashType(v.purpose)])
        )
    })
    const machine = program
        .compile(false)
        .createCekMachine([
            makeUplcDataValue(makeIntData(2)),
            makeUplcDataValue(makeIntData(0))
        ])
    let checked = false
    for (let i = 0; i < 10000; i++) {
        const snapshot = machine.snapshot()
        if (
            snapshot.currentTerm?.site?.line === 4 &&
            snapshot.stack?.values.some((v) => v.name === "n")
        ) {
            const site = snapshot.currentTerm.site
            const values = snapshot.stack.values
            const before = machine.snapshot()
            for (const expression of [
                `Scripts::config_validator == ValidatorHash::new(#${hash})`,
                `Addresses::config == Address::from_validator(ValidatorHash::new(#${hash}))`,
                `Scripts::hash_watch == MintingPolicyHash::new(#${ownHash})`
            ])
                assert.equal(
                    String(evaluator.evaluate(expression, site, values).value),
                    "true"
                )
            assert.equal(
                String(missing.evaluate("n == 3", site, values).value),
                "true"
            )
            for (const other of [missing, placeholder])
                assert.throws(
                    () => other.evaluate("Addresses::config", site, values),
                    /Hash for config_validator was not captured/
                )
            assert.deepEqual(machine.snapshot(), before)
            assert.equal(
                compilation.unoptimized.hashDependencies.config_validator,
                `#${hash}`
            )
            checked = true
            break
        }
        if (machine.step().kind !== "running") break
    }
    assert(checked)
})
