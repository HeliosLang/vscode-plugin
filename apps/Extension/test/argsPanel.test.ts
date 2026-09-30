import { collectTypeSchemas } from "../src/typeSchemas"
import { migrateArgumentNamespaces } from "../src/argumentNamespaces"
import { importCapturedArguments, resolveSchema, deriveTypeName } from "schemas"
import { test } from "node:test"
import assert from "node:assert/strict"
import { StoreHelper } from "schemas"
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

test("saved portfolio actions do not break assets action lookup", () => {
    const ast = new Program(`spending assets_validator
    enum Action { Count { supply_ptr: Int } Other { portfolio_ptr: Int } }
    func main(_, action: Action) -> Bool { action.switch { Count{ supply_ptr } => supply_ptr >= 0, Other{ portfolio_ptr } => portfolio_ptr >= 0 } }`)
    const schema = ast.userTypes.assets_validator.Action.toSchema()
    const store = {
        values: {
            "Action::portfolio_capture": { _tag: "2" },
            "Action::assets_capture": { _tag: "1", portfolio_ptr: "01" }
        },
        links: {}
    }
    const helper = new StoreHelper(store)
    const cbor = helper.getValue("Action::assets_capture", schema)!
    assert.deepEqual(helper.findValueNames("Action", schema, cbor), [
        "assets_capture"
    ])
    assert.equal(
        helper.getValue("Action::portfolio_capture", schema),
        undefined
    )
    assert.deepEqual(helper.getTypeOptions("Action", schema), [
        "assets_capture"
    ])
    assert.deepEqual(store.values["Action::portfolio_capture"], { _tag: "2" })
})

function actionProgram(name: string) {
    return new Program(`spending ${name}
    enum Action { Count { ptr: Int } Other { ptr: Int } }
    func main(_, action: Action) -> Bool { action.switch { Count{ptr} => ptr >= 0, Other{ptr} => ptr >= 0 } }`)
}

test("type names are qualified only for distinct defining identities", () => {
    const assets = actionProgram("assets_validator")
    const portfolio = actionProgram("portfolio_validator")
    const unique = collectTypeSchemas({ assets, same: assets })
    assert.equal(
        collectEntryPointInfo(assets, "main", unique)!.args[1].type,
        "Action"
    )
    const schemas = collectTypeSchemas({ assets, portfolio })
    assert.equal(schemas.Action, undefined)
    assert.equal(
        collectEntryPointInfo(assets, "main", schemas)!.args[1].type,
        "assets_validator::Action"
    )
    assert.equal(
        collectEntryPointInfo(portfolio, "main", schemas)!.args[1].type,
        "portfolio_validator::Action"
    )
    assert.equal(
        deriveTypeName(
            resolveSchema(schemas, "[]Option[assets_validator::Action]")
        ),
        "[]Option[assets_validator::Action]"
    )
    assert.throws(() => resolveSchema(schemas, "unknown::Action"))
    assert.equal(resolveSchema(schemas, "Int").kind, "internal")
})

test("identical action CBOR stays isolated across validators and legacy migration preserves bytes", () => {
    const assets = actionProgram("assets_validator")
    const portfolio = actionProgram("portfolio_validator")
    const schemas = collectTypeSchemas({ assets, portfolio })
    const cbor = "d8799f01ff"
    const legacy = {
        values: {
            "assets_validator::main": { action: cbor },
            "portfolio_validator::main": { action: cbor },
            "Action::saved": { _tag: "0", ptr: "01" }
        },
        links: {
            "assets_validator::main::action": "Action::saved",
            "portfolio_validator::main::action": "Action::saved"
        }
    }
    const first = migrateArgumentNamespaces(assets, legacy, schemas)
    const second = migrateArgumentNamespaces(portfolio, first, schemas)
    const a = second.links["assets_validator::main::action"]
    const b = second.links["portfolio_validator::main::action"]
    assert.match(a, /^assets_validator::Action::/)
    assert.match(b, /^portfolio_validator::Action::/)
    assert.notEqual(a, b)
    assert.deepEqual(
        second.values["Action::saved"],
        legacy.values["Action::saved"]
    )
    const helper = new StoreHelper(second)
    assert.equal(helper.getValue(a, schemas["assets_validator::Action"]), cbor)
    assert.equal(
        helper.getValue(b, schemas["portfolio_validator::Action"]),
        cbor
    )
    assert.equal(helper.getTypeOptions("Action").length, 1)
    assert.equal(
        helper.getValidLinkValueName("assets_validator::main", "action"),
        a.slice(a.lastIndexOf("::") + 2)
    )
    assert.equal(migrateArgumentNamespaces(assets, second, schemas), second)
    const imported = importCapturedArguments(
        second,
        schemas,
        "assets_validator::main",
        "new",
        [{ name: "action", type: "assets_validator::Action", cbor }]
    )
    assert.equal(imported.links["assets_validator::main::action"], a)
    const unique = collectTypeSchemas({ assets })
    const back = migrateArgumentNamespaces(assets, second, unique)
    assert.match(back.links["assets_validator::main::action"], /^Action::/)
    assert.equal(back.values["assets_validator::main"].action, cbor)
})
