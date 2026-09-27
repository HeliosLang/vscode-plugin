import { bytesToHex, encodeUtf8 } from "@helios-lang/codec-utils"
import { type TypeSchema, type FieldTypeSchema } from "@helios-lang/type-utils"
import { decodeUplcData, makeIntData, type UplcData } from "@helios-lang/uplc"
import { type Store } from "./store"
import {
    convertFieldsToUplcData,
    deriveTypeName,
    resolveSchema,
    DCERT_VARIANTS,
    SCRIPT_PURPOSE_VARIANTS,
    SPENDING_CREDENTIAL_VARIANTS,
    STAKING_HASH_VARIANTS,
    TX_OUTPUT_DATUM_VARIANTS
} from "./values"

const internal = (name: string): TypeSchema => ({ kind: "internal", name })
const list = (name: string): TypeSchema => ({
    kind: "list",
    itemType: internal(name)
})
const option = (name: string): TypeSchema => ({
    kind: "option",
    someType: internal(name)
})
const map = (key: string, value: string): TypeSchema => ({
    kind: "map",
    keyType: internal(key),
    valueType: internal(value)
})
const fields = (items: [string, string | TypeSchema][]): FieldTypeSchema[] =>
    items.map(([name, type]) => ({
        name,
        type: typeof type === "string" ? internal(type) : type
    }))
const builtins: Record<string, FieldTypeSchema[]> = {
    Address: fields([
        ["credential", "SpendingCredential"],
        ["staking_credential", option("StakingCredential")]
    ]),
    AssetClass: fields([
        ["mph", "MintingPolicyHash"],
        ["token_name", "ByteArray"]
    ]),
    ScriptContext: fields([
        ["tx", "Tx"],
        ["purpose", "ScriptPurpose"]
    ]),
    StakingCredential: fields([["hash", "StakingHash"]]),
    Tx: fields([
        ["inputs", list("TxInput")],
        ["ref_inputs", list("TxInput")],
        ["outputs", list("TxOutput")],
        ["fee", "Value"],
        ["minted", "Value"],
        ["dcerts", list("DCert")],
        ["withdrawals", map("StakingCredential", "Int")],
        ["time_range", "TimeRange"],
        ["signatories", list("PubKeyHash")],
        ["redeemers", map("ScriptPurpose", "Data")],
        ["datums", map("DatumHash", "Data")],
        ["id", "TxId"]
    ]),
    TxId: fields([["value", "ByteArray"]]),
    TxInput: fields([
        ["output_id", "TxOutputId"],
        ["output", "TxOutput"]
    ]),
    TxOutput: fields([
        ["address", "Address"],
        ["value", "Value"],
        ["datum", "TxOutputDatum"],
        ["ref_script", option("ScriptHash")]
    ]),
    TxOutputId: fields([
        ["tx_id", "TxId"],
        ["index", "Int"]
    ])
}
const variants = {
    DCert: DCERT_VARIANTS,
    ScriptPurpose: SCRIPT_PURPOSE_VARIANTS,
    SpendingCredential: SPENDING_CREDENTIAL_VARIANTS,
    StakingHash: STAKING_HASH_VARIANTS,
    TxOutputDatum: TX_OUTPUT_DATUM_VARIANTS
}
const hex = (data: UplcData) => bytesToHex(data.toCbor())
function requireShape(
    condition: unknown,
    message = "Data does not match type"
): asserts condition {
    if (!condition) throw new Error(message)
}
function constr(data: UplcData, tag?: number, count?: number) {
    requireShape(
        data.kind === "constr" &&
            (tag === undefined || data.tag === tag) &&
            (count === undefined || data.fields.length === count)
    )
    return data as Extract<UplcData, { kind: "constr" }>
}

/** Inverse of the existing editor serializer. Child schemas drive named links. */
export function decodeValueFields(
    schema: TypeSchema,
    data: UplcData
): { fields: Record<string, string>; children: FieldTypeSchema[] } {
    const result: Record<string, string> = {}
    const children: FieldTypeSchema[] = []
    const add = (name: string, type: TypeSchema, value: UplcData) => {
        result[name] = hex(value)
        children.push({ name, type })
    }
    const addFields = (types: FieldTypeSchema[], values: UplcData[]) => {
        requireShape(types.length === values.length)
        types.forEach((f, i) => add(f.name, f.type, values[i]))
    }
    const addList = (values: UplcData[], type: TypeSchema, prefix = "item") =>
        values.forEach((v, i) => add(`${prefix}-${i}`, type, v))
    const addMap = (value: UplcData, key: TypeSchema, val: TypeSchema) => {
        requireShape(value.kind === "map")
        value.items.forEach(([k, v], i) => {
            add(`key-${i}`, key, k)
            add(`value-${i}`, val, v)
        })
    }
    switch (schema.kind) {
        case "reference":
            throw new Error(`Unresolved schema ${schema.id}`)
        case "struct":
            if (schema.format === "singleton")
                addFields(schema.fieldTypes, [data])
            else if (schema.format === "list") {
                requireShape(data.kind === "list")
                addFields(schema.fieldTypes, data.items)
            } else {
                requireShape(
                    data.kind === "map" &&
                        data.items.length === schema.fieldTypes.length
                )
                schema.fieldTypes.forEach((f, i) => {
                    const [key, value] = data.items[i]
                    requireShape(
                        key.kind === "bytes" &&
                            bytesToHex(key.bytes) ===
                                bytesToHex(encodeUtf8(f.key ?? f.name)),
                        "Map struct keys/order do not match the editable schema"
                    )
                    add(f.name, f.type, value)
                })
            }
            break
        case "enum": {
            const value = constr(data)
            const variant = schema.variantTypes.find((v) => v.tag === value.tag)
            requireShape(variant, "Unknown enum variant")
            result._tag = String(value.tag)
            addFields(variant.fieldTypes, value.fields)
            break
        }
        case "variant":
            addFields(schema.fieldTypes, constr(data, schema.tag).fields)
            break
        case "tuple":
            requireShape(data.kind === "list")
            requireShape(data.items.length === schema.itemTypes.length)
            data.items.forEach((v, i) =>
                add(`item-${i}`, schema.itemTypes[i], v)
            )
            break
        case "list":
            requireShape(data.kind === "list")
            addList(data.items, schema.itemType)
            break
        case "map":
            addMap(data, schema.keyType, schema.valueType)
            break
        case "option": {
            const value = constr(data)
            requireShape(
                (value.tag === 0 && value.fields.length === 1) ||
                    (value.tag === 1 && value.fields.length === 0)
            )
            result._tag = String(value.tag)
            if (value.tag === 0) add("some", schema.someType, value.fields[0])
            break
        }
        case "internal": {
            const name = schema.name
            if (builtins[name]) {
                addFields(builtins[name], constr(data, 0).fields)
                break
            }
            if (name in variants) {
                const value = constr(data)
                const variant = variants[name as keyof typeof variants].find(
                    (v) => v.tag === value.tag
                )
                requireShape(variant, `Unsupported ${name} tag`)
                result._tag = String(value.tag)
                addFields(variant.fieldTypes, value.fields)
                break
            }
            if (name === "TimeRange") {
                const bounds = constr(data, 0, 2).fields
                bounds.forEach((bound, i) => {
                    const prefix = i === 0 ? "start" : "end"
                    const pair = constr(bound, 0, 2).fields
                    const limit = constr(pair[0])
                    requireShape(
                        [0, 1, 2].includes(limit.tag) &&
                            limit.fields.length === (limit.tag === 1 ? 1 : 0)
                    )
                    result[`${prefix}_tag`] = String(limit.tag)
                    if (limit.tag === 1)
                        add(`${prefix}_value`, internal("Int"), limit.fields[0])
                    add(`include_${prefix}`, internal("Bool"), pair[1])
                })
                break
            }
            if (name === "Value") {
                requireShape(data.kind === "map")
                data.items.forEach(([policy, tokens], i) => {
                    add(`policy-${i}`, internal("MintingPolicyHash"), policy)
                    requireShape(tokens.kind === "map")
                    tokens.items.forEach(([token, quantity], j) => {
                        add(
                            `token-name-${i}-${j}`,
                            internal("ByteArray"),
                            token
                        )
                        add(`quantity-${i}-${j}`, internal("Int"), quantity)
                    })
                })
                break
            }
            if (name === "Data") {
                switch (data.kind) {
                    case "constr":
                        result._tag = "0"
                        result.tag = hex(makeIntData(data.tag))
                        addList(data.fields, internal("Data"), "field")
                        break
                    case "map":
                        result._tag = "1"
                        addMap(data, internal("Data"), internal("Data"))
                        break
                    case "list":
                        result._tag = "2"
                        addList(data.items, internal("Data"))
                        break
                    case "int":
                        result._tag = "3"
                        result.value = hex(data)
                        break
                    case "bytes":
                        result._tag = "4"
                        result.bytes = hex(data)
                        break
                }
                break
            }
            if (["Int", "Real", "Time", "Duration"].includes(name))
                requireShape(data.kind === "int")
            else if (name === "Bool") {
                const v = constr(data, undefined, 0)
                requireShape(v.tag === 0 || v.tag === 1)
            } else if (name === "Ratio")
                requireShape(
                    data.kind === "list" &&
                        data.items.length === 2 &&
                        data.items.every((d) => d.kind === "int")
                )
            else {
                requireShape(
                    [
                        "String",
                        "ByteArray",
                        "PubKey",
                        "PubKeyHash",
                        "ValidatorHash",
                        "MintingPolicyHash",
                        "StakingValidatorHash",
                        "ScriptHash",
                        "DatumHash"
                    ].includes(name),
                    `Unsupported type ${name}`
                )
                requireShape(data.kind === "bytes")
            }
            result.value = hex(data)
        }
    }
    requireShape(
        hex(convertFieldsToUplcData(schema, result)) === hex(data),
        "Editor conversion would change captured data"
    )
    return { fields: result, children }
}

// Match ArgInput's existing editing model: only these primitive types have
// inline controls. Hashes, IDs and Data use named-value dropdowns as well.
function requiresNamedValue(schema: TypeSchema): boolean {
    return (
        schema.kind !== "internal" ||
        ![
            "Int",
            "Real",
            "Time",
            "Duration",
            "Bool",
            "ByteArray",
            "String",
            "Ratio"
        ].includes(schema.name)
    )
}

/** Pure transactional import: callers persist the returned ordinary editor Store. */
export function importCapturedArguments(
    store: Store,
    schemas: Record<string, TypeSchema>,
    contextKey: string,
    captureId: string,
    args: { name: string; type: string; cbor: string }[]
): Store {
    const next: Store = JSON.parse(JSON.stringify(store))
    const prefix = captureId.split("-")[0].replace(/[^a-zA-Z0-9_]/g, "_")
    let nodes = 0
    const imported = new Set<string>()
    // Index each type only when encountered. Values are stored as editable CBOR
    // fields, so use the same serializer as the forms to identify full values.
    const existingByType = new Map<string, Map<string, string>>()
    const valueIndex = (schema: TypeSchema): Map<string, string> => {
        const type = deriveTypeName(schema)
        let index = existingByType.get(type)
        if (!index) {
            index = new Map()
            for (const [key, fields] of Object.entries(next.values)) {
                if (!key.startsWith(`${type}::`)) continue
                try {
                    const cbor = hex(convertFieldsToUplcData(schema, fields))
                    if (!index.has(cbor)) index.set(cbor, key)
                } catch {
                    /* Incomplete existing editor values aren't matches. */
                }
            }
            existingByType.set(type, index)
        }
        return index
    }
    const dereference = (schema: TypeSchema): TypeSchema => {
        if (schema.kind !== "reference") return schema
        const resolved = Object.values(schemas).find(
            (s) => "id" in s && s.id === schema.id && s.kind !== "reference"
        )
        requireShape(resolved, `Unknown type reference ${schema.id}`)
        return resolved
    }
    const importValue = (
        schema: TypeSchema,
        data: UplcData,
        depth: number,
        named: boolean
    ): string | undefined => {
        requireShape(
            depth < 100 && ++nodes <= 50000,
            "Captured value exceeds editor complexity limit"
        )
        schema = dereference(schema)
        const decoded = decodeValueFields(schema, data)
        let key: string | undefined
        if (named || requiresNamedValue(schema)) {
            const indexByCbor = valueIndex(schema)
            const cbor = hex(data)
            const existing = indexByCbor.get(cbor)
            if (existing) key = existing
            else {
                const type = deriveTypeName(schema)
                const slug = type.replace(/[^a-zA-Z0-9_]/g, "_")
                let index = 1
                do {
                    key = `${type}::${prefix}_${slug}_${index++}`
                } while (key in next.values)
                next.values[key] = decoded.fields
                indexByCbor.set(cbor, key)
            }
            if (imported.has(key)) return key
            imported.add(key)
        }
        for (const field of decoded.children) {
            const child = importValue(
                field.type,
                decodeUplcData(decoded.fields[field.name]),
                depth + 1,
                false
            )
            if (key && child) next.links[`${key}::${field.name}`] = child
        }
        return key
    }
    next.values[contextKey] = { ...next.values[contextKey] }
    for (const key of Object.keys(next.links))
        if (key.startsWith(`${contextKey}::`)) delete next.links[key]
    for (const arg of args) {
        try {
            requireShape(
                /^(?:[0-9a-fA-F]{2})+$/.test(arg.cbor),
                "Invalid CBOR hex"
            )
            const data = decodeUplcData(arg.cbor)
            const key = importValue(
                resolveSchema(schemas, arg.type),
                data,
                0,
                true
            )!
            next.values[contextKey][arg.name] = arg.cbor
            next.links[`${contextKey}::${arg.name}`] = key
        } catch (error) {
            throw new Error(
                `Cannot import ${arg.name} (${arg.type}): ${(error as Error).message}`
            )
        }
    }
    return next
}
