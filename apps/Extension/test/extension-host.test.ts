/** Run through VS Code --extensionTestsPath; uses an isolated workspace and fake service. */
import * as vscode from "vscode"
import { checkSelectionErrors } from "./capture-selection-errors"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { makeNilValue } from "schemas"
import { bytesToHex } from "@helios-lang/codec-utils"
import {
    decodeUplcData,
    makeListData,
    makeConstrData,
    makeIntData,
    makeByteArrayData
} from "@helios-lang/uplc"
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const id = "ce937e2e-7251-458d-844a-04685a9c79e2"
const key = "hdbg_" + "a".repeat(64)
export async function run() {
    const root = vscode.workspace.workspaceFolders![0].uri.fsPath
    const configDir = process.env.HELIOS_CONFIG_HOME!
    const source = await readFile(join(root, "time_lock.hl"), "utf8")
    const module = await readFile(join(root, "asset_search.hl"), "utf8")
    const cbor = (v: any) => bytesToHex(v.toCbor())
    const empty = decodeUplcData(
        makeNilValue({ kind: "internal", name: "ScriptContext" })
    ) as any
    const txFields = [...empty.fields[0].fields]
    txFields[7] = makeConstrData(0, [
        makeConstrData(0, [
            makeConstrData(1, [makeIntData(0)]),
            makeConstrData(1, [])
        ]),
        makeConstrData(0, [makeConstrData(2, []), makeConstrData(1, [])])
    ])
    const context = cbor(
        makeConstrData(0, [makeConstrData(0, txFields), empty.fields[1]])
    )
    const args = [
        cbor(
            makeListData([
                makeIntData(1000),
                makeByteArrayData("11".repeat(28)),
                makeByteArrayData("22".repeat(28))
            ])
        ),
        cbor(makeConstrData(1, [])),
        context
    ]
    const evaluation = {
        plutusVersion: "PlutusScriptV2",
        scriptHash: "00".repeat(28),
        arguments: args,
        sourceMap: { sourceNames: ["time_lock", "asset_search"] }
    }
    const capture = {
        version: 1,
        captureId: id,
        status: "failed",
        sources: { time_lock: source, asset_search: module },
        evaluations: [evaluation]
    }
    let polls = 0,
        payloads = 0
    const server = createServer((req, res) => {
        assert.equal(req.headers.authorization, `Bearer ${key}`)
        res.setHeader("Content-Type", "application/json")
        if (req.url === "/v1/project")
            res.end(
                JSON.stringify({ name: "Test project", id: "test-project" })
            )
        else if (req.url?.startsWith("/v1/captures?")) {
            polls++
            res.end(
                JSON.stringify(
                    req.url.endsWith("=0")
                        ? {
                              cursor: "1",
                              captures: [
                                  {
                                      seq: 1,
                                      captureId: id,
                                      status: "failed",
                                      createdAt: 1700000000
                                  }
                              ]
                          }
                        : { cursor: "1", captures: [] }
                )
            )
        } else if (req.url === `/v1/captures/${id}`) {
            payloads++
            res.end(JSON.stringify(capture))
        } else {
            res.statusCode = 404
            res.end("{}")
        }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
        const port = (server.address() as any).port
        await mkdir(configDir, { recursive: true, mode: 0o700 })
        await writeFile(
            join(configDir, "debugger.json"),
            JSON.stringify({
                version: 1,
                profiles: {
                    "test-project": {
                        id: "test-project",
                        name: "Test",
                        apiKey: key,
                        endpoint: `http://127.0.0.1:${port}`
                    }
                }
            }),
            { mode: 0o600 }
        )
        await vscode.extensions.getExtension("HeliosLang.helios")!.activate()
        await vscode.commands.executeCommand("workbench.view.debug")
        await vscode.commands.executeCommand("helios.capturedFailedTxs.focus")
        for (let i = 0; i < 100 && !payloads; i++) await pause(100)
        assert.equal(payloads, 1, "view should poll and fetch capture on load")
        await vscode.commands.executeCommand("helios.refreshCapturedTxs")
        assert.ok(polls >= 2, "refresh polls index again")
        await vscode.commands.executeCommand(
            "helios.loadCapturedTx",
            `test-project:${id}:0`
        )
        const store = JSON.parse(
            await readFile(join(root, ".vscode", "heliosdebugger.json"), "utf8")
        )
        assert.equal(store.values["time_lock::main"].datum, args[0])
        assert.equal(store.values["time_lock::main"].redeemer, args[1])
        assert.equal(store.values["time_lock::main"].ScriptContext, args[2])
        assert.ok(
            store.links["time_lock::main::datum"].includes("ce937e2e_Datum_")
        )
        assert.ok(Object.keys(store.values).length > 12)
        assert.ok(!JSON.stringify(store).includes(key))
        await vscode.commands.executeCommand(
            "helios.loadCapturedTx",
            `test-project:${id}:0`
        )
        assert.deepEqual(
            JSON.parse(
                await readFile(
                    join(root, ".vscode", "heliosdebugger.json"),
                    "utf8"
                )
            ),
            store,
            "repeat selection must reuse existing values"
        )
        // Inspect actual adapter traffic from a locally recompiled capture.
        let stopped = false
        const tracker = vscode.debug.registerDebugAdapterTrackerFactory(
            "heliosdebugger",
            {
                createDebugAdapterTracker() {
                    return {
                        onDidSendMessage(message) {
                            if (
                                message.event === "stopped" &&
                                message.body.reason === "exception"
                            )
                                stopped = true
                        }
                    }
                }
            }
        )
        try {
            const doc = await vscode.workspace.openTextDocument(
                vscode.Uri.file(join(root, "time_lock.hl"))
            )
            await vscode.window.showTextDocument(doc)
            await pause(300)
            assert.ok(
                await vscode.debug.startDebugging(
                    vscode.workspace.workspaceFolders![0],
                    {
                        type: "heliosdebugger",
                        request: "launch",
                        name: "Captured time-lock"
                    }
                )
            )
            for (let i = 0; i < 100 && !stopped; i++) await pause(100)
            assert.ok(stopped, "Run should pause at script failure")
            const frames = await vscode.debug.activeDebugSession!.customRequest(
                "stackTrace",
                { threadId: 1 }
            )
            assert.equal(frames.stackFrames[0].name, "validate_unlock")
            await vscode.debug.stopDebugging()
        } finally {
            tracker.dispose()
        }
        await checkSelectionErrors(`test-project:${id}:0`)
        if (process.env.HELIOS_UI_WAIT)
            await pause(Number(process.env.HELIOS_UI_WAIT))
        console.log(
            "Extension host: capture polling, import, persistence and exception stop passed"
        )
    } finally {
        server.close()
    }
}
