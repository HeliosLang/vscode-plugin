import { capturedArguments } from "../src/captureImport"
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readFileSync } from "node:fs"
import { Program } from "@helios-lang/compiler"
import { makeSource } from "@helios-lang/compiler-utils"
import { bytesToHex } from "@helios-lang/codec-utils"
import {
    makeConstrData,
    makeIntData,
    makeListData,
    makeMapData,
    makeByteArrayData,
    decodeUplcData,
    makeUplcDataValue
} from "@helios-lang/uplc"
import {
    importCapturedArguments,
    convertFieldsToUplcData,
    resolveSchema,
    makeNilValue,
    decodeValueFields,
    StoreHelper
} from "schemas"
import { configPath, readCaptureProfiles } from "../src/captureConfig"
import {
    CaptureFeed,
    ServiceError,
    validatorName,
    validateCapture
} from "../src/captureFeed"
const key = "hdbg_" + "a".repeat(64)
const profile = {
    id: "project",
    name: "Project",
    apiKey: key,
    endpoint: "https://debugger.example.com"
}
const id = "ce937e2e-7251-458d-844a-04685a9c79e2"
const payload = {
    version: 1,
    captureId: id,
    status: "failed",
    evaluations: [
        {
            plutusVersion: "PlutusScriptV2",
            scriptHash: "a".repeat(56),
            arguments: ["00"],
            sourceMap: { sourceNames: ["validator", "module"] }
        }
    ],
    sources: { validator: "spending time_lock\n", module: "module helper\n" }
}
const hex = (data: any) => bytesToHex(data.toCbor())

test("CLI credential paths and owner-only profile files", async () => {
    assert.equal(
        configPath("linux", {}, "/home/test"),
        "/home/test/.config/helios/debugger.json"
    )
    assert.equal(
        configPath("linux", { XDG_CONFIG_HOME: "/config" }, "/home/test"),
        "/config/helios/debugger.json"
    )
    assert.equal(
        configPath("darwin", {}, "/Users/test"),
        "/Users/test/Library/Application Support/Helios/debugger.json"
    )
    assert.equal(
        configPath(
            "win32",
            { APPDATA: "C:\\Users\\test\\AppData\\Roaming" },
            "C:\\Users\\test"
        ),
        "C:\\Users\\test\\AppData\\Roaming\\Helios\\debugger.json"
    )
    assert.equal(
        configPath("linux", { HELIOS_CONFIG_HOME: "/override" }, "/home/test"),
        "/override/debugger.json"
    )
    const dir = await mkdtemp(join(tmpdir(), "helios-profile-test-"))
    const file = join(dir, "debugger.json")
    try {
        assert.deepEqual(await readCaptureProfiles(file), [])
        await writeFile(
            file,
            JSON.stringify({ version: 1, profiles: { project: profile } }),
            { mode: 0o600 }
        )
        assert.deepEqual(await readCaptureProfiles(file), [profile])
        await chmod(file, 0o644)
        if (process.platform !== "win32")
            await assert.rejects(readCaptureProfiles(file), /only/)
        await chmod(file, 0o600)
        await writeFile(file, '{"version":2,"profiles":{}}')
        await assert.rejects(readCaptureProfiles(file), /Invalid/)
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})

test("feed merges projects, deduplicates, updates cursors, and excludes successful captures", async () => {
    const requests: string[] = []
    const feed = new CaptureFeed(async (p, path) => {
        requests.push(p.id + path)
        if (path === "/v1/project") return { name: "Current " + p.name }
        if (path.startsWith("/v1/captures?"))
            return path.endsWith("=0")
                ? {
                      cursor: "2",
                      captures: [
                          {
                              captureId: id,
                              status: "failed",
                              createdAt: p.id === "project" ? 10 : 20,
                              seq: 1
                          },
                          {
                              captureId: "a".repeat(36),
                              status: "succeeded",
                              createdAt: 21,
                              seq: 2
                          }
                      ]
                  }
                : { cursor: "2", captures: [] }
        return payload
    })
    feed.configure([profile, { ...profile, id: "other", name: "Other" }])
    await feed.poll(new AbortController().signal)
    assert.equal(feed.rows.length, 2)
    assert.equal(feed.rows[0].project, "Current Other")
    assert.equal(feed.rows[0].validator, "time_lock")
    await feed.poll(new AbortController().signal)
    assert.equal(feed.rows.length, 2)
    assert.equal(requests.filter((r) => r.endsWith("/" + id)).length, 2)
    feed.configure([profile])
    await feed.poll(new AbortController().signal)
    assert.equal(feed.rows.length, 1)
    assert.equal(
        validatorName({ ...payload, sources: {} }, payload.evaluations[0]),
        undefined
    )
    assert.throws(
        () => validateCapture({ ...payload, version: 2 }, id),
        /Invalid/
    )
})

test("a rejected project does not stop other feeds; refresh retries it", async () => {
    let bad = 0
    const feed = new CaptureFeed(async (p, path) => {
        if (p.id === "bad") {
            bad++
            throw new ServiceError(401)
        }
        if (path === "/v1/project") return { name: p.name }
        return { cursor: "0", captures: [] }
    })
    feed.configure([{ ...profile, id: "bad" }, profile])
    await feed.poll(new AbortController().signal)
    assert.match(feed.errors[0], /helios login/)
    await feed.poll(new AbortController().signal)
    assert.equal(bad, 1)
    await feed.poll(new AbortController().signal, true)
    assert.equal(bad, 2)
})

test("recursive import uses normal values and links, preserves originals and avoids collisions", () => {
    const types: any = {
        Datum: {
            kind: "struct",
            name: "Datum",
            id: "Datum",
            format: "list",
            fieldTypes: [
                { name: "value", type: { kind: "internal", name: "Int" } },
                {
                    name: "nested",
                    type: {
                        kind: "list",
                        itemType: {
                            kind: "option",
                            someType: { kind: "internal", name: "Int" }
                        }
                    }
                }
            ]
        }
    }
    const cbor = hex(
        makeListData([
            makeIntData(2n ** 80n),
            makeListData([
                makeConstrData(0, [makeIntData(42)]),
                makeConstrData(1, [])
            ])
        ])
    )
    const before = { values: { "Existing::keep": { value: "00" } }, links: {} }
    const result = importCapturedArguments(
        before,
        types,
        "validator::main",
        id,
        [{ name: "datum", type: "Datum", cbor }]
    )
    assert.equal(result.values["validator::main"].datum, cbor)
    assert.equal(Object.keys(before.values).length, 1)
    const datum = result.links["validator::main::datum"]
    assert.match(datum, /Datum::ce937e2e_Datum_1/)
    const nested = result.links[datum + "::nested"]
    assert.ok(nested)
    assert.ok(result.links[nested + "::item-0"])
    const helper = new StoreHelper(result)
    assert.equal(helper.getValue(datum, types.Datum), cbor)
    const again = importCapturedArguments(
        result,
        types,
        "validator::main",
        id,
        [{ name: "datum", type: "Datum", cbor }]
    )
    assert.equal(again.links["validator::main::datum"], datum)
    assert.deepEqual(again, result)
    assert.throws(
        () =>
            importCapturedArguments(before, types, "validator::main", id, [
                { name: "datum", type: "Datum", cbor: "00" }
            ]),
        /Cannot import datum/
    )
    assert.equal(Object.keys(before.values).length, 1)
    assert.equal(
        resolveSchema({}, "Map[[]Int]Option[Map[Int][]ByteArray]").kind,
        "map"
    )
})

test("all builtin structured editor values round-trip", () => {
    for (const type of [
        "Address",
        "AssetClass",
        "ScriptContext",
        "Tx",
        "TxInput",
        "TxOutput",
        "TxId",
        "TxOutputId",
        "TxOutputDatum",
        "TimeRange",
        "Value",
        "DCert",
        "ScriptPurpose",
        "StakingCredential",
        "StakingHash",
        "SpendingCredential"
    ]) {
        const schema = { kind: "internal" as const, name: type }
        const cbor = makeNilValue(schema)
        const store = importCapturedArguments(
            { values: {}, links: {} },
            {},
            "validator::main",
            id,
            [{ name: "value", type, cbor }]
        )
        assert.equal(
            hex(
                convertFieldsToUplcData(
                    schema,
                    store.values[store.links["validator::main::value"]]
                )
            ),
            hex(decodeUplcData(cbor)),
            type
        )
    }
})

test("generic Data preserves constructor, list and map order", () => {
    const data = makeConstrData(17, [
        makeMapData([
            [makeByteArrayData([2]), makeIntData(-42)],
            [makeByteArrayData([1]), makeListData([])]
        ])
    ])
    const schema = { kind: "internal" as const, name: "Data" }
    assert.equal(
        hex(
            convertFieldsToUplcData(
                schema,
                decodeValueFields(schema, data).fields
            )
        ),
        hex(data)
    )
})

// Opt-in local acceptance uses the real capture without committing private payloads.
if (process.env.HELIOS_CAPTURE_FIXTURE)
    test("real multi-file time-lock capture imports and re-evaluates the expected failure", () => {
        const capture = JSON.parse(
            readFileSync(process.env.HELIOS_CAPTURE_FIXTURE!, "utf8")
        )
        const main = makeSource(
            readFileSync("../../examples/time_lock.hl", "utf8"),
            { name: "time_lock.hl" }
        )
        const module = makeSource(
            readFileSync("../../examples/asset_search.hl", "utf8"),
            { name: "asset_search.hl" }
        )
        const program = new Program(main, { moduleSources: [module] })
        const schemas: any = {}
        for (const types of Object.values(program.userTypes))
            for (const [name, type] of Object.entries(types))
                schemas[name] = type.toSchema()
        const args = capture.evaluations[0].arguments
        const store = importCapturedArguments(
            { values: {}, links: {} },
            schemas,
            "time_lock::main",
            capture.captureId,
            [
                { name: "datum", type: "Datum", cbor: args[0] },
                { name: "redeemer", type: "Redeemer", cbor: args[1] },
                { name: "ScriptContext", type: "ScriptContext", cbor: args[2] }
            ]
        )
        assert.ok(Object.keys(store.values).length > 15)
        const actual = program
            .compile(false)
            .eval(
                args.map((cbor: string) =>
                    makeUplcDataValue(decodeUplcData(cbor))
                ) as any
            )
        assert.ok("left" in actual.result)
    })

test("spending, minting and staking captures map to the actual main argument names", () => {
    const base = decodeUplcData(
        makeNilValue({ kind: "internal", name: "ScriptContext" })
    ) as any
    for (const [purpose, tag] of [
        ["spending", 1],
        ["minting", 0],
        ["staking", 2]
    ] as const) {
        const source = `${purpose} selection
func main(${purpose === "spending" ? "d: Int, " : ""}r: Int) -> Bool { ${purpose === "spending" ? "d == r" : "r == 0"} }`
        const program = new Program(source)
        const context = hex(
            makeConstrData(0, [
                base.fields[0],
                makeConstrData(tag, [makeByteArrayData([])])
            ])
        )
        const evaluation = {
            ...payload.evaluations[0],
            arguments:
                purpose === "spending" ? ["00", "00", context] : ["00", context]
        }
        const specs = capturedArguments(program, evaluation)
        assert.deepEqual(
            specs.map((s) => s.name),
            purpose === "spending"
                ? ["d", "r", "ScriptContext"]
                : ["r", "ScriptContext"]
        )
        assert.throws(
            () => capturedArguments(program, { ...evaluation, arguments: [] }),
            /signature/
        )
        assert.throws(
            () =>
                capturedArguments(program, {
                    ...evaluation,
                    plutusVersion: "PlutusScriptV3"
                }),
            /Plutus V2/
        )
    }
})

test("recursive references resolve into ordinary named editor values", () => {
    const node: any = {
        kind: "enum",
        name: "Tree",
        id: "tree-id",
        variantTypes: [
            {
                kind: "variant",
                name: "Leaf",
                id: "leaf",
                tag: 0,
                fieldTypes: [
                    { name: "value", type: { kind: "internal", name: "Int" } }
                ]
            },
            {
                kind: "variant",
                name: "Branch",
                id: "branch",
                tag: 1,
                fieldTypes: [
                    {
                        name: "children",
                        type: {
                            kind: "list",
                            itemType: { kind: "reference", id: "tree-id" }
                        }
                    }
                ]
            }
        ]
    }
    const value = makeConstrData(1, [
        makeListData([makeConstrData(0, [makeIntData(1)])])
    ])
    const store = importCapturedArguments(
        { values: {}, links: {} },
        { Tree: node },
        "main",
        id,
        [{ name: "datum", type: "Tree", cbor: hex(value) }]
    )
    assert.ok(Object.keys(store.values).length >= 4)
})

test("CBOR reuse works across captures, preserves user names, and distinguishes types", () => {
    const nested: any = {
        kind: "struct",
        name: "Box",
        id: "box",
        format: "singleton",
        fieldTypes: [{ name: "value", type: { kind: "internal", name: "Int" } }]
    }
    const types: any = { Box: nested }
    const store = {
        values: {
            "Box::my_box": { value: "182a" },
            "Int::my_int": { value: "182a" },
            "Box::unfinished": {}
        },
        links: {}
    }
    const args = [
        { name: "a", type: "Box", cbor: "182a" },
        { name: "b", type: "Int", cbor: "182a" },
        {
            name: "items",
            type: "[]Box",
            cbor: hex(makeListData([makeIntData(42), makeIntData(42)]))
        }
    ]
    const imported = importCapturedArguments(
        store,
        types,
        "validator::main",
        id,
        args
    )
    assert.equal(imported.links["validator::main::a"], "Box::my_box")
    assert.equal(imported.links["validator::main::b"], "Int::my_int")
    const items = imported.links["validator::main::items"]
    assert.equal(imported.links[items + "::item-0"], "Box::my_box")
    assert.equal(imported.links[items + "::item-1"], "Box::my_box")
    assert.equal(Object.keys(imported.values).length, 5)
    const other = importCapturedArguments(
        imported,
        types,
        "validator::main",
        "aaaaaaaa-7251-458d-844a-04685a9c79e2",
        args
    )
    assert.deepEqual(other, imported)
    const changed = importCapturedArguments(
        other,
        types,
        "validator::main",
        id,
        [{ name: "a", type: "Box", cbor: "182b" }]
    )
    assert.notEqual(changed.links["validator::main::a"], "Box::my_box")
    assert.equal(changed.values["Box::my_box"].value, "182a")
})

test("hashes and IDs receive reusable names for the existing dropdown editors", () => {
    const schema: any = {
        kind: "struct",
        name: "Datum",
        id: "Datum",
        format: "list",
        fieldTypes: [
            { name: "owner", type: { kind: "internal", name: "PubKeyHash" } },
            {
                name: "beneficiary",
                type: { kind: "internal", name: "PubKeyHash" }
            }
        ]
    }
    const hash = makeByteArrayData("11".repeat(28))
    const args = [
        { name: "datum", type: "Datum", cbor: hex(makeListData([hash, hash])) }
    ]
    const existing = {
        values: { "Datum::mine": { owner: hex(hash), beneficiary: hex(hash) } },
        links: {}
    }
    const imported = importCapturedArguments(
        existing,
        { Datum: schema },
        "validator::main",
        id,
        args
    )
    assert.equal(imported.links["validator::main::datum"], "Datum::mine")
    const owner = imported.links["Datum::mine::owner"]
    assert.ok(owner.startsWith("PubKeyHash::"))
    assert.equal(imported.links["Datum::mine::beneficiary"], owner)
    assert.deepEqual(
        importCapturedArguments(
            imported,
            { Datum: schema },
            "validator::main",
            id,
            args
        ),
        imported
    )
})
