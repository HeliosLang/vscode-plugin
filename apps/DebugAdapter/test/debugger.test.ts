import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawn } from "node:child_process"
import { Program } from "@helios-lang/compiler"
import { makeSource } from "@helios-lang/compiler-utils"
import { bytesToHex } from "@helios-lang/codec-utils"
import {
    encodeFullUplcProgram,
    makeListData,
    makeIntData,
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
    const file = resolve("../../examples/time_lock.hl")
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
        h.request("continue")
    }
    assert.equal((await h.stop()).event, "terminated")
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
            throw new Error(`No DAP response: ${stderr}`)
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
