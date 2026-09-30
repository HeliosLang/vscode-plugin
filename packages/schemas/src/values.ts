import {
    BytesLike,
    bytesToHex,
    decodeUtf8,
    encodeUtf8,
    isValidUtf8
} from "@helios-lang/codec-utils"
import { blake2b } from "@helios-lang/crypto"
import {
    ADA,
    makeDummyAssetClass,
    makeDummyMintingPolicyHash,
    makeDummyPubKey,
    makeDummyPubKeyHash,
    makeDummyShelleyAddress,
    makeDummyStakingValidatorHash,
    makeDummyTxId,
    makeDummyTxOutputId,
    makeDummyValidatorHash,
    makeScriptContextV2,
    makeSpendingPurpose,
    makeTimeRange,
    makeTxInput,
    makeTxOutput,
    makeTxOutputId,
    makeValue
} from "@helios-lang/ledger"
import {
    expectDefined,
    FieldTypeSchema,
    OptionTypeSchema,
    VariantTypeSchema,
    type TypeSchema
} from "@helios-lang/type-utils"
import {
    decodeUplcData,
    expectConstrData,
    expectIntData,
    makeByteArrayData,
    makeConstrData,
    makeIntData,
    makeListData,
    makeMapData,
    type UplcData
} from "@helios-lang/uplc"

export function deriveTypeName(schema: TypeSchema): string {
    switch (schema.kind) {
        case "tuple":
            return `(${schema.itemTypes.map((it) => deriveTypeName(it)).join(",")})`
        case "list":
            return `[]${deriveTypeName(schema.itemType)}`
        case "map":
            return `Map[${deriveTypeName(schema.keyType)}]${deriveTypeName(schema.valueType)}`
        case "option":
            return `Option[${deriveTypeName(schema.someType)}]`
        case "internal":
        case "variant":
        case "struct":
        case "enum":
            return schema.name
        case "reference":
            return schema.id
    }
}

export function makeUniqueValueName(
    store: Record<string, any>,
    typeName: string
): string {
    let nonce = 1

    while (true) {
        const name = `${slugifyTypeName(typeName)}-value-${nonce}`
        const key = `${typeName}::${name}`

        if (key in store) {
            nonce++
            continue
        }

        return name
    }
}

export function slugifyTypeName(type: string): string {
    if (type.startsWith("[]")) {
        return slugifyTypeName(type.slice(2)) + "_list"
    } else if (type.startsWith("Map[")) {
        const keySlug = slugifyTypeName(type.slice(4).split("]")[0])
        const valueSlug = slugifyTypeName(type.slice(4).split("]")[1].trim())

        return `${keySlug}_${valueSlug}_map`
    } else if (type.startsWith("Option[")) {
        const someSlug = slugifyTypeName(type.slice(7).split("]")[0])

        const after = type.slice(7).split("]")[1].trim()

        if (after != "") {
            if (after.startsWith("::Some")) {
                return `${someSlug}_option_some`
            } else if (after.startsWith("::None")) {
                return `${someSlug}_option_none`
            } else {
                return `${someSlug}_option_unexpected`
            }
        } else {
            return `${someSlug}_option`
        }
    } else if (type.includes("::")) {
        const [before, ...after] = type.split("::")

        return `${slugifyTypeName(before)}__${slugifyTypeName(after.join(""))}`
    } else {
        return type.replace(/[^a-zA-Z0-9_]/g, "_")
    }
}

// TODO: complete this list
const BUILTIN_TYPES = [
    "Address",
    "AssetClass",
    "Bool",
    "ByteArray",
    "Data",
    "DatumHash",
    "DCert",
    "Duration",
    "Int",
    "MintingPolicyHash",
    "PubKey",
    "PubKeyHash",
    "Ratio",
    "Real",
    "ScriptContext",
    "ScriptHash",
    "String",
    "ScriptPurpose",
    "SpendingCredential",
    "StakingCredential",
    "StakingHash",
    "StakingPurpose",
    "StakingValidatorHash",
    "Time",
    "TimeRange",
    "Tx",
    "TxId",
    "TxInput",
    "TxOutput",
    "TxOutputDatum",
    "TxOutputId",
    "ValidatorHash",
    "Value"
]

export function resolveSchema(
    schemas: Record<string, TypeSchema>,
    typeName: string
): TypeSchema {
    if (typeName in schemas) {
        return schemas[typeName]
    } else if (
        Object.values(schemas).some(
            (s) => "id" in s && s.id === typeName && s.kind !== "reference"
        )
    ) {
        return Object.values(schemas).find(
            (s) => "id" in s && s.id === typeName && s.kind !== "reference"
        )!
    } else if (BUILTIN_TYPES.includes(typeName)) {
        return { kind: "internal", name: typeName }
    } else if (typeName.startsWith("[]")) {
        const itemTypeName = typeName.slice(2)

        return {
            kind: "list",
            itemType: resolveSchema(schemas, itemTypeName)
        }
    } else if (typeName.startsWith("Map[")) {
        const end = matchingBracket(typeName, 3)
        return {
            kind: "map",
            keyType: resolveSchema(schemas, typeName.slice(4, end)),
            valueType: resolveSchema(schemas, typeName.slice(end + 1).trim())
        }
    } else if (
        typeName.startsWith("Option[") &&
        matchingBracket(typeName, 6) === typeName.length - 1
    ) {
        return {
            kind: "option",
            someType: resolveSchema(schemas, typeName.slice(7, -1))
        }
    } else if (typeName.startsWith("(") && typeName.endsWith(")")) {
        const parts: string[] = []
        let depth = 0,
            start = 1
        for (let i = 1; i < typeName.length - 1; i++) {
            if ("[(".includes(typeName[i])) depth++
            if ("])".includes(typeName[i])) depth--
            if (typeName[i] === "," && depth === 0) {
                parts.push(typeName.slice(start, i).trim())
                start = i + 1
            }
        }
        parts.push(typeName.slice(start, -1).trim())
        return {
            kind: "tuple",
            itemTypes: parts.map((t) => resolveSchema(schemas, t))
        }
    } else {
        throw new Error(`Unable to resolve schema of ${typeName}`)
    }
}

function matchingBracket(text: string, start: number): number {
    let depth = 0
    for (let i = start; i < text.length; i++) {
        if (text[i] === "[") depth++
        if (text[i] === "]" && --depth === 0) return i
    }
    throw new Error(`Invalid type ${text}`)
}

export function tryResolveSchema(
    schemas: Record<string, TypeSchema> | undefined,
    typeName: string | undefined
): TypeSchema | undefined {
    if (!schemas || !typeName) {
        return undefined
    }

    try {
        return resolveSchema(schemas, typeName)
    } catch (_) {
        return undefined
    }
}

function encodeBool(b: boolean): string {
    return bytesToHex(makeConstrData(b ? 1 : 0, []).toCbor())
}

function encodeByteArray(bs: BytesLike): string {
    return bytesToHex(makeByteArrayData(bs).toCbor())
}

function encodeInt(x: bigint | number): string {
    return bytesToHex(makeIntData(x).toCbor())
}

function encodeRatio(top: bigint | number, bottom: bigint | number): string {
    return bytesToHex(
        makeListData([makeIntData(top), makeIntData(bottom)]).toCbor()
    )
}

function encodeReal(x: number): string {
    return bytesToHex(makeIntData(Math.round(x * 1_000_000)).toCbor())
}

function encodeString(s: string): string {
    return bytesToHex(makeByteArrayData(encodeUtf8(s)).toCbor())
}

const DEFAULT_BOOL_LIST_FIELDS: Record<string, string> = {
    "item-0": encodeBool(false),
    "item-1": encodeBool(false),
    "item-2": encodeBool(false),
    "item-3": encodeBool(false)
}

const DEFAULT_BYTEARRAY_LIST_FIELDS: Record<string, string> = {
    "item-0": encodeByteArray("01"),
    "item-1": encodeByteArray("02"),
    "item-2": encodeByteArray("03"),
    "item-3": encodeByteArray("04")
}

const DEFAULT_INT_LIST_FIELDS: Record<string, string> = {
    "item-0": encodeInt(0),
    "item-1": encodeInt(1),
    "item-2": encodeInt(2),
    "item-3": encodeInt(3)
}

const DEFAULT_RATIO_LIST_FIELDS: Record<string, string> = {
    "item-0": encodeRatio(1, 4),
    "item-1": encodeRatio(2, 4),
    "item-2": encodeRatio(3, 4),
    "item-3": encodeRatio(4, 4)
}

const DEFAULT_REAL_LIST_FIELDS: Record<string, string> = {
    "item-0": encodeReal(0.1),
    "item-1": encodeReal(0.2),
    "item-2": encodeReal(0.3),
    "item-3": encodeReal(0.4)
}

const DEFAULT_STRING_LIST_FIELDS: Record<string, string> = {
    "item-0": encodeString("a"),
    "item-1": encodeString("b"),
    "item-2": encodeString("c"),
    "item-3": encodeString("d")
}

export function makeDefaultFieldValues(
    schema: TypeSchema
): Record<string, string> {
    switch (schema.kind) {
        case "internal": {
            switch (schema.name) {
                case "AssetClass":
                    return {
                        mph: encodeByteArray(""),
                        token_name: encodeByteArray("")
                    }
                case "Bool":
                    return { value: encodeBool(true) }
                case "ByteArray":
                    return { value: encodeByteArray("DEADBEEF") }
                case "Int":
                    return { value: encodeInt(42) }
                case "MintingPolicyHash":
                    return { value: encodeByteArray([]) }
                case "Ratio":
                    return { value: encodeRatio(2, 3) }
                case "Real":
                    return { value: encodeInt(3_141_592) }
                case "String":
                    return { value: encodeString("Hello world") }
                case "ScriptPurpose":
                    return {
                        _tag: "1",
                        output_id: bytesToHex(
                            makeDummyTxOutputId().toUplcData().toCbor()
                        )
                    }
                case "TimeRange": {
                    const tr = makeTimeRange(
                        Number.NEGATIVE_INFINITY,
                        Number.POSITIVE_INFINITY
                    )

                    return {
                        start_tag:
                            tr.start == Number.NEGATIVE_INFINITY
                                ? "0"
                                : tr.start == Number.POSITIVE_INFINITY
                                  ? "2"
                                  : "1",
                        start_value: encodeInt(
                            tr.finiteStart ??
                                Math.round((Date.now() / 1000) * 1000)
                        ),
                        include_start: encodeBool(tr.includeStart),
                        end_tag:
                            tr.end == Number.NEGATIVE_INFINITY
                                ? "0"
                                : tr.end == Number.POSITIVE_INFINITY
                                  ? "2"
                                  : "1",
                        end_value: encodeInt(
                            tr.finiteEnd ??
                                Math.round((Date.now() / 1000) * 1000)
                        ),
                        include_end: encodeBool(tr.includeEnd)
                    }
                }
                case "Value":
                    return {
                        "policy-0": encodeByteArray([]),
                        "token-name-0-0": encodeByteArray([]),
                        "quantity-0-0": encodeInt(0)
                    }
                default:
                    return makeNilFieldValues(schema)
            }
        }
        case "list":
            if (schema.itemType.kind == "internal") {
                switch (schema.itemType.name) {
                    case "Bool":
                        return DEFAULT_BOOL_LIST_FIELDS
                    case "ByteArray":
                        return DEFAULT_BYTEARRAY_LIST_FIELDS
                    case "Int":
                        return DEFAULT_INT_LIST_FIELDS
                    case "Ratio":
                        return DEFAULT_RATIO_LIST_FIELDS
                    case "Real":
                        return DEFAULT_REAL_LIST_FIELDS
                    case "String":
                        return DEFAULT_STRING_LIST_FIELDS
                }
            }

            return {}
        case "map":
            return {}
        case "option":
            return { _tag: "1" }
        case "enum": {
            const variant = schema.variantTypes[0]

            const fields: Record<string, string> = {
                _tag: variant.tag.toString()
            }

            for (let ft of variant.fieldTypes) {
                fields[ft.name] = makeDefaultValue(ft.type)
            }

            return fields
        }
        case "variant":
        case "struct": {
            const fields: Record<string, string> = {}

            for (let ft of schema.fieldTypes) {
                fields[ft.name] = makeDefaultValue(ft.type)
            }

            return fields
        }
        case "tuple":
            const fields: Record<string, string> = {}

            for (let i = 0; i < schema.itemTypes.length; i++) {
                fields[`item-${i}`] = makeDefaultValue(schema.itemTypes[i])
            }

            return fields
        case "reference":
            throw new Error("Reference type schemas no handled")
    }
}

export function makeNilFieldValues(schema: TypeSchema): Record<string, string> {
    switch (schema.kind) {
        case "internal": {
            switch (schema.name) {
                case "Address": {
                    const addr = makeDummyShelleyAddress(false)
                    const addrData = expectConstrData(addr.toUplcData(), 0, 2)

                    return {
                        credential: bytesToHex(addrData.fields[0].toCbor()),
                        staking_credential: bytesToHex(
                            addrData.fields[1].toCbor()
                        )
                    }
                }
                case "AssetClass": {
                    const ac = makeDummyAssetClass()
                    return {
                        mph: encodeByteArray(ac.mph.bytes),
                        token_name: encodeByteArray(ac.tokenName)
                    }
                }
                case "Bool":
                    return { value: encodeBool(false) }
                case "ByteArray":
                    return { value: encodeByteArray([]) }
                case "Data":
                    return {
                        _tag: "0",
                        tag: encodeInt(0)
                    } // order: ConstrData (with tag and field-<i>), MapData (with key-<i> and value-<i>), ListData (with item-<i>), IntData (with value), ByteArrayData (with bytes)
                case "DCert":
                    return {
                        _tag: "0",
                        credential: bytesToHex(
                            makeConstrData(0, [
                                makeConstrData(0, [
                                    makeDummyPubKeyHash().toUplcData()
                                ])
                            ]).toCbor()
                        )
                    }
                case "Duration":
                    return { value: encodeInt(0) }
                case "Int":
                    return { value: encodeInt(0) }
                case "MintingPolicyHash":
                    return { value: encodeByteArray([]) }
                case "PubKey":
                    return { value: bytesToHex(makeDummyPubKey().toCbor()) }
                case "PubKeyHash":
                    return { value: bytesToHex(makeDummyPubKeyHash().toCbor()) }
                case "DatumHash":
                    return { value: encodeByteArray(new Array(32).fill(0)) }
                case "Ratio":
                    return { value: encodeRatio(0, 0) }
                case "Real":
                    return { value: encodeInt(0) }
                case "ScriptContext": {
                    const scriptContext = makeScriptContextV2(
                        {
                            inputs: [],
                            outputs: []
                        },
                        makeSpendingPurpose(makeDummyTxOutputId())
                    )

                    const scriptContextData = expectConstrData(
                        scriptContext.toUplcData(),
                        0,
                        2
                    )

                    return {
                        tx: bytesToHex(scriptContextData.fields[0].toCbor()),
                        purpose: bytesToHex(
                            scriptContextData.fields[1].toCbor()
                        )
                    }
                }
                case "ScriptPurpose":
                    return {
                        _tag: "0",
                        policy_hash: bytesToHex(
                            makeDummyMintingPolicyHash().toUplcData().toCbor()
                        )
                    }
                case "SpendingCredential":
                    return {
                        _tag: "0",
                        hash: encodeByteArray(makeDummyPubKeyHash().bytes)
                    }
                case "StakingCredential":
                    return {
                        hash: bytesToHex(
                            makeConstrData(0, [
                                makeByteArrayData(makeDummyPubKeyHash().bytes)
                            ]).toCbor()
                        )
                    }
                case "StakingHash":
                    return {
                        _tag: "0",
                        hash: encodeByteArray(makeDummyPubKeyHash().bytes)
                    }
                case "StakingValidatorHash":
                    return {
                        value: bytesToHex(
                            makeDummyStakingValidatorHash().toCbor()
                        )
                    }
                case "String":
                    return { value: encodeString("") }
                case "Time":
                    return { value: encodeInt(0) }
                case "TimeRange":
                    return {
                        start_tag: "0",
                        start_value: encodeInt(
                            Math.round(Date.now() / 1000) * 1000
                        ),
                        end_tag: "2",
                        end_value: encodeInt(
                            Math.round(Date.now() / 1000) * 1000
                        ),
                        include_start: encodeBool(false),
                        include_end: encodeBool(false)
                    }
                case "Tx": {
                    return {
                        inputs: bytesToHex(makeListData([]).toCbor()),
                        ref_inputs: bytesToHex(makeListData([]).toCbor()),
                        outputs: bytesToHex(makeListData([]).toCbor()),
                        fee: bytesToHex(makeValue(0n).toUplcData().toCbor()),
                        minted: bytesToHex(
                            makeValue(0n).toUplcData(true).toCbor()
                        ),
                        dcerts: bytesToHex(makeListData([]).toCbor()),
                        withdrawals: bytesToHex(makeMapData([]).toCbor()),
                        time_range: bytesToHex(
                            makeTimeRange(
                                Number.NEGATIVE_INFINITY,
                                Number.POSITIVE_INFINITY
                            )
                                .toUplcData()
                                .toCbor()
                        ),
                        signatories: bytesToHex(makeListData([]).toCbor()),
                        redeemers: bytesToHex(makeMapData([]).toCbor()),
                        datums: bytesToHex(makeMapData([]).toCbor()),
                        id: bytesToHex(
                            makeConstrData(0, [
                                makeByteArrayData(makeDummyTxId().bytes)
                            ]).toCbor()
                        )
                    }
                }
                case "TxId":
                    return {
                        value: bytesToHex(
                            makeByteArrayData(makeDummyTxId().bytes).toCbor()
                        )
                    }
                case "TxInput": {
                    const input = makeTxInput(
                        makeDummyTxOutputId(),
                        makeTxOutput(
                            makeDummyShelleyAddress(false),
                            makeValue(0n)
                        )
                    )
                    const inputData = expectConstrData(input.toUplcData(), 0, 2)

                    return {
                        output_id: bytesToHex(inputData.fields[0].toCbor()),
                        output: bytesToHex(inputData.fields[1].toCbor())
                    }
                }
                case "TxOutput": {
                    const output = makeTxOutput(
                        makeDummyShelleyAddress(false),
                        makeValue(0n)
                    )
                    const data = expectConstrData(output.toUplcData(), 0, 4)

                    return {
                        address: bytesToHex(data.fields[0].toCbor()),
                        value: bytesToHex(data.fields[1].toCbor()),
                        datum: bytesToHex(data.fields[2].toCbor()),
                        ref_script: bytesToHex(data.fields[3].toCbor())
                    }
                }
                case "TxOutputDatum":
                    return {
                        _tag: "0"
                    }
                case "TxOutputId": {
                    const data = expectConstrData(
                        makeDummyTxOutputId().toUplcData(),
                        0,
                        2
                    )
                    return {
                        tx_id: bytesToHex(data.fields[0].toCbor()),
                        index: bytesToHex(data.fields[1].toCbor())
                    }
                }
                case "ValidatorHash":
                    return {
                        value: bytesToHex(makeDummyValidatorHash().toCbor())
                    }
                case "Value":
                    return {}
                default:
                    throw new Error(
                        `Unhandled internal type ${schema.name} in makeNilFieldValues()`
                    )
            }
        }
        case "list":
            return {}
        case "map":
            return {}
        case "option":
            return { _tag: "1" }
        case "enum": {
            const variant = schema.variantTypes[0]

            const fields: Record<string, string> = {
                _tag: variant.tag.toString()
            }

            for (let ft of variant.fieldTypes) {
                fields[ft.name] = makeNilValue(ft.type)
            }

            return fields
        }
        case "variant":
        case "struct": {
            const fields: Record<string, string> = {}

            for (let ft of schema.fieldTypes) {
                fields[ft.name] = makeNilValue(ft.type)
            }

            return fields
        }
        case "tuple":
            const fields: Record<string, string> = {}

            for (let i = 0; i < schema.itemTypes.length; i++) {
                fields[`item-${i}`] = makeNilValue(schema.itemTypes[i])
            }

            return fields
        case "reference":
            throw new Error("Reference type schemas no handled")
    }
}

/**
 * Converts the fields record to a list of UplcData values
 * Uses the default type value if a field is missing or isn't valid UplcData cbor
 * @param fields
 * @param fieldSchemas
 * @returns
 */
function convertFieldsToUplcDataFields(
    fieldSchemas: FieldTypeSchema[],
    fields: Record<string, string>
): UplcData[] {
    const result: UplcData[] = []

    for (let fieldSchema of fieldSchemas) {
        const fieldValue = fields[fieldSchema.name]

        let data: undefined | UplcData = undefined

        if (fieldValue) {
            try {
                data = decodeUplcData(fieldValue)
            } catch (_) {}
        }

        if (!data) {
            data = decodeUplcData(makeDefaultValue(fieldSchema.type))
        }

        result.push(data)
    }

    return result
}

function convertFieldsToUplcDataList(
    fields: Record<string, string>,
    prefix: string = "item"
): UplcData[] {
    const result: UplcData[] = []

    for (let i = 0; true; i++) {
        const field = fields[`${prefix}-${i}`]

        if (field) {
            result.push(decodeUplcData(field))
        } else {
            break
        }
    }

    return result
}

function convertFieldsToUplcDataPairList(
    fields: Record<string, string>
): [UplcData, UplcData][] {
    const result: [UplcData, UplcData][] = []

    for (let i = 0; true; i++) {
        const key = fields[`key-${i}`]
        const value = fields[`value-${i}`]

        if (key && value) {
            result.push([decodeUplcData(key), decodeUplcData(value)])
        } else {
            break
        }
    }

    return result
}

export function convertFieldsToUplcData(
    schema: TypeSchema,
    fields: Record<string, string>
): UplcData {
    switch (schema.kind) {
        case "internal":
            switch (schema.name) {
                case "Address":
                    return makeConstrData(0, [
                        decodeUplcData(fields.credential),
                        decodeUplcData(fields.staking_credential)
                    ])
                case "AssetClass":
                    return makeConstrData(0, [
                        decodeUplcData(fields.mph),
                        decodeUplcData(fields.token_name)
                    ])

                case "Data": {
                    switch (parseInt(fields._tag)) {
                        case 0:
                            return makeConstrData(
                                expectIntData(decodeUplcData(fields.tag)).value,
                                convertFieldsToUplcDataList(fields, "field")
                            )
                        case 1:
                            return makeMapData(
                                convertFieldsToUplcDataPairList(fields)
                            )
                        case 2:
                            return makeListData(
                                convertFieldsToUplcDataList(fields)
                            )
                        case 3:
                            return decodeUplcData(fields.value)
                        case 4:
                            return decodeUplcData(fields.bytes)
                        default:
                            return decodeUplcData(fields.value)
                    }
                }
                case "DCert": {
                    switch (parseInt(fields._tag)) {
                        case 0:
                            return makeConstrData(0, [
                                decodeUplcData(fields.credential)
                            ])
                        case 1:
                            return makeConstrData(1, [
                                decodeUplcData(fields.credential)
                            ])
                        case 2:
                            return makeConstrData(2, [
                                decodeUplcData(fields.delegator),
                                decodeUplcData(fields.pool_id)
                            ])
                        case 3:
                            return makeConstrData(3, [
                                decodeUplcData(fields.pool_id),
                                decodeUplcData(fields.pool_vrf)
                            ])
                        case 4:
                            return makeConstrData(4, [
                                decodeUplcData(fields.pool_id),
                                decodeUplcData(fields.epoch)
                            ])
                        default:
                            throw new Error(
                                `Unhandled DCert tag ${fields._tag}`
                            )
                    }
                }
                case "Bool":
                case "ByteArray":
                case "Duration":
                case "Int":
                case "MintingPolicyHash":
                case "PubKey":
                case "PubKeyHash":
                case "DatumHash":
                case "Ratio":
                case "Real":
                    return decodeUplcData(fields.value)
                case "ScriptContext":
                    return makeConstrData(0, [
                        decodeUplcData(fields.tx),
                        decodeUplcData(fields.purpose)
                    ])
                case "ScriptHash":
                    return decodeUplcData(fields.value)
                case "ScriptPurpose":
                    switch (parseInt(fields._tag)) {
                        case 0:
                            return makeConstrData(0, [
                                decodeUplcData(fields.policy_hash)
                            ])
                        case 1:
                            return makeConstrData(1, [
                                decodeUplcData(fields.output_id)
                            ])
                        case 2:
                            return makeConstrData(2, [
                                decodeUplcData(fields.credential)
                            ])
                        case 3:
                            return makeConstrData(3, [
                                decodeUplcData(fields.dcert)
                            ])
                        default:
                            throw new Error(
                                `Unhandled ScriptPurpose tag ${fields._tag}`
                            )
                    }
                case "SpendingCredential":
                    return makeConstrData(parseInt(fields._tag), [
                        decodeUplcData(fields.hash)
                    ])
                case "StakingCredential":
                    // don't bother supporting staking pointers
                    return makeConstrData(0, [decodeUplcData(fields.hash)])
                case "StakingHash":
                    return makeConstrData(parseInt(fields._tag), [
                        decodeUplcData(fields.hash)
                    ])
                case "StakingValidatorHash":
                    return decodeUplcData(fields.value)
                case "String":
                    return decodeUplcData(fields.value)
                case "Time":
                    return decodeUplcData(fields.value)
                case "TimeRange":
                    return makeConstrData(0, [
                        makeConstrData(0, [
                            (() => {
                                switch (fields.start_tag) {
                                    case "0":
                                        return makeConstrData(0, [])
                                    case "1":
                                        return makeConstrData(1, [
                                            decodeUplcData(fields.start_value)
                                        ])
                                    case "2":
                                        return makeConstrData(2, [])
                                    default:
                                        throw new Error(
                                            `Unhandled TimeRange bounds start tag ${fields.start_tag}`
                                        )
                                }
                            })(),
                            decodeUplcData(fields.include_start)
                        ]),
                        makeConstrData(0, [
                            (() => {
                                switch (fields.end_tag) {
                                    case "0":
                                        return makeConstrData(0, [])
                                    case "1":
                                        return makeConstrData(1, [
                                            decodeUplcData(fields.end_value)
                                        ])
                                    case "2":
                                        return makeConstrData(2, [])
                                    default:
                                        throw new Error(
                                            `Unhandled TimeRange bounds end tag ${fields.end_tag}`
                                        )
                                }
                            })(),
                            decodeUplcData(fields.include_end)
                        ])
                    ])
                case "Tx":
                    return makeConstrData(0, [
                        decodeUplcData(fields.inputs),
                        decodeUplcData(fields.ref_inputs ?? fields.refInputs),
                        decodeUplcData(fields.outputs),
                        decodeUplcData(fields.fee),
                        decodeUplcData(fields.minted),
                        decodeUplcData(fields.dcerts),
                        decodeUplcData(fields.withdrawals),
                        decodeUplcData(fields.time_range),
                        decodeUplcData(fields.signatories),
                        decodeUplcData(fields.redeemers),
                        decodeUplcData(fields.datums),
                        decodeUplcData(fields.id)
                    ])
                case "TxId":
                    return makeConstrData(0, [decodeUplcData(fields.value)]) // this changes for Plutus V3 !
                case "TxInput":
                    return makeConstrData(0, [
                        decodeUplcData(fields.output_id),
                        decodeUplcData(fields.output)
                    ])
                case "TxOutput":
                    return makeConstrData(0, [
                        decodeUplcData(fields.address),
                        decodeUplcData(fields.value),
                        decodeUplcData(fields.datum),
                        decodeUplcData(fields.ref_script)
                    ])
                case "TxOutputDatum":
                    switch (parseInt(fields._tag)) {
                        case 0:
                            return makeConstrData(0, [])
                        case 1:
                            return makeConstrData(1, [
                                decodeUplcData(fields.hash)
                            ])
                        case 2:
                            return makeConstrData(2, [
                                decodeUplcData(fields.data)
                            ])
                        default:
                            return makeConstrData(0, [])
                    }
                case "TxOutputId":
                    return makeConstrData(0, [
                        decodeUplcData(fields.tx_id),
                        decodeUplcData(fields.index)
                    ])
                case "ValidatorHash":
                    return decodeUplcData(fields.value)
                case "Value": {
                    const policies = convertFieldsToUplcDataList(
                        fields,
                        "policy"
                    )

                    return makeMapData(
                        policies.map((p, i) => {
                            let tokenNames = convertFieldsToUplcDataList(
                                fields,
                                `token-name-${i}`
                            )
                            let quantities = convertFieldsToUplcDataList(
                                fields,
                                `quantity-${i}`
                            )
                            if (tokenNames.length != quantities.length) {
                                const n = Math.min(
                                    tokenNames.length,
                                    quantities.length
                                )
                                tokenNames = tokenNames.slice(0, n)
                                quantities = quantities.slice(0, n)
                            }

                            return [
                                p,
                                makeMapData(
                                    tokenNames.map((tn, j) => {
                                        return [tn, quantities[j]]
                                    })
                                )
                            ]
                        })
                    )
                }
                default:
                    throw new Error(
                        `Internal type '${schema.name}' unhandled in convertFieldsToUplcData()`
                    )
            }

        case "tuple":
        case "list":
            return makeListData(convertFieldsToUplcDataList(fields))
        case "map":
            return makeMapData(convertFieldsToUplcDataPairList(fields))
        case "option":
            if (fields._tag == "0") {
                return makeConstrData(0, [decodeUplcData(fields["some"])])
            } else {
                return makeConstrData(1, [])
            }
        case "variant":
            return makeConstrData(
                schema.tag,
                convertFieldsToUplcDataFields(schema.fieldTypes, fields)
            )
        case "struct": {
            const dataFields = convertFieldsToUplcDataFields(
                schema.fieldTypes,
                fields
            )

            switch (schema.format) {
                case "singleton":
                    return expectDefined(dataFields[0])
                case "list":
                    return makeListData(dataFields)
                case "map":
                    return makeMapData(
                        schema.fieldTypes.map((ft, i): [UplcData, UplcData] => {
                            return [
                                makeByteArrayData(
                                    encodeUtf8(ft.key ?? ft.name)
                                ),
                                expectDefined(dataFields[i])
                            ]
                        })
                    )
            }
        }
        case "enum":
            const tag = parseInt(expectDefined(fields._tag))
            const variant = expectDefined(
                schema.variantTypes.find((vt) => vt.tag == tag)
            )

            const dataFields = convertFieldsToUplcDataFields(
                variant.fieldTypes,
                fields
            )

            return makeConstrData(tag, dataFields)
        case "reference":
            throw new Error(
                `Reference type schema unhandledin convertFieldsToUplcData`
            )
    }
}

export function correctTagChange(
    schema: TypeSchema,
    tag: number,
    fields: Record<string, string>
) {
    if (Number.isNaN(tag)) {
        return
    }

    switch (schema.kind) {
        case "enum":
            correctVariantChange(schema.variantTypes, tag, fields)
            break
        case "option":
            correctVariantChange(makeOptionVariantSchemas(schema), tag, fields)
            break
        case "internal":
            switch (schema.name) {
                case "Data":
                    correctVariantChange(DATA_VARIANTS, tag, fields)
                case "DCert":
                    correctVariantChange(DCERT_VARIANTS, tag, fields)
                    break
                case "ScriptPurpose":
                    correctVariantChange(SCRIPT_PURPOSE_VARIANTS, tag, fields)
                    break
                case "SpendingCredential":
                    correctVariantChange(
                        SPENDING_CREDENTIAL_VARIANTS,
                        tag,
                        fields
                    )
                    break
                case "StakingHash":
                    correctVariantChange(STAKING_HASH_VARIANTS, tag, fields)
                    break
                case "TxOutputDatum":
                    correctVariantChange(TX_OUTPUT_DATUM_VARIANTS, tag, fields)
                    break
            }
    }
}

function correctVariantChange(
    variants: VariantTypeSchema[],
    tag: number,
    fields: Record<string, string>
) {
    const variant = variants.find((vt) => vt.tag == tag)

    if (!variant) {
        return
    }

    for (let ft of variant.fieldTypes) {
        const prevValue = fields[ft.name]

        try {
            const fieldExistsInOtherVariant = variants.some((v) => {
                return (
                    v.name != variant.name &&
                    v.fieldTypes.some((oft) => oft.name == ft.name)
                )
            })

            // TODO: validateUplcData isn't good enough, the schemas must match exactly

            if (
                !prevValue ||
                fieldExistsInOtherVariant ||
                !validateUplcData(ft.type, decodeUplcData(prevValue))
            ) {
                throw new Error()
            }
        } catch (_) {
            fields[ft.name] = makeDefaultValue(ft.type)
        }
    }
}

export function makeOptionVariantSchemas(
    optionSchema: OptionTypeSchema
): VariantTypeSchema[] {
    return [
        {
            kind: "variant",
            id: "Some",
            name: "Some",
            tag: 0,
            fieldTypes: [
                {
                    name: "some",
                    type: optionSchema.someType
                }
            ]
        },
        {
            kind: "variant",
            id: "None",
            name: "None",
            tag: 1,
            fieldTypes: []
        }
    ]
}

const DATA_VARIANTS: VariantTypeSchema[] = [
    {
        kind: "variant",
        id: "ConstrData",
        name: "ConstrData",
        tag: 0,
        fieldTypes: [
            {
                name: "tag",
                type: { kind: "internal", name: "Int" }
            }
        ]
    },
    {
        kind: "variant",
        id: "MapData",
        name: "MapData",
        tag: 1,
        fieldTypes: []
    },
    {
        kind: "variant",
        id: "ListData",
        name: "ListData",
        tag: 2,
        fieldTypes: []
    },
    {
        kind: "variant",
        id: "IntData",
        name: "IntData",
        tag: 3,
        fieldTypes: [
            {
                name: "value",
                type: { kind: "internal", name: "Int" }
            }
        ]
    },
    {
        kind: "variant",
        id: "ByteArrayData",
        name: "ByteArrayData",
        tag: 4,
        fieldTypes: [
            {
                name: "bytes",
                type: { kind: "internal", name: "ByteArray" }
            }
        ]
    }
]
export const DCERT_VARIANTS: VariantTypeSchema[] = [
    {
        kind: "variant",
        id: "Register",
        name: "Register",
        tag: 0,
        fieldTypes: [
            {
                name: "credential",
                type: { kind: "internal", name: "StakingCredential" }
            }
        ]
    },
    {
        kind: "variant",
        id: "Deregister",
        name: "Deregister",
        tag: 1,
        fieldTypes: [
            {
                name: "credential",
                type: { kind: "internal", name: "StakingCredential" }
            }
        ]
    },
    {
        kind: "variant",
        id: "Delegate",
        name: "Delegate",
        tag: 2,
        fieldTypes: [
            {
                name: "delegator",
                type: { kind: "internal", name: "StakingCredential" }
            },
            {
                name: "pool_id",
                type: { kind: "internal", name: "PubKeyHash" }
            }
        ]
    },
    {
        kind: "variant",
        id: "RegisterPool",
        name: "RegisterPool",
        tag: 3,
        fieldTypes: [
            {
                name: "pool_id",
                type: { kind: "internal", name: "PubKeyHash" }
            },
            {
                name: "pool_vrf",
                type: { kind: "internal", name: "PubKeyHash" }
            }
        ]
    },
    {
        kind: "variant",
        id: "RetirePool",
        name: "RetirePool",
        tag: 4,
        fieldTypes: [
            {
                name: "pool_id",
                type: { kind: "internal", name: "PubKeyHash" }
            },
            {
                name: "epoch",
                type: { kind: "internal", name: "Int" }
            }
        ]
    }
]

export const SCRIPT_PURPOSE_VARIANTS: VariantTypeSchema[] = [
    {
        kind: "variant",
        id: "Minting",
        name: "Minting",
        tag: 0,
        fieldTypes: [
            {
                name: "policy_hash",
                type: { kind: "internal", name: "MintingPolicyHash" }
            }
        ]
    },
    {
        kind: "variant",
        id: "Spending",
        name: "Spending",
        tag: 1,
        fieldTypes: [
            {
                name: "output_id",
                type: { kind: "internal", name: "TxOutputId" }
            }
        ]
    },
    {
        kind: "variant",
        id: "Rewarding",
        name: "Rewarding",
        tag: 2,
        fieldTypes: [
            {
                name: "credential",
                type: { kind: "internal", name: "StakingCredential" }
            }
        ]
    },
    {
        kind: "variant",
        id: "Certifying",
        name: "Certifying",
        tag: 3,
        fieldTypes: [
            {
                name: "dcert",
                type: { kind: "internal", name: "DCert" }
            }
        ]
    }
]

export const STAKING_HASH_VARIANTS: VariantTypeSchema[] = [
    {
        kind: "variant",
        id: "StakeKey",
        name: "StakeKey",
        tag: 0,
        fieldTypes: [
            {
                name: "hash",
                type: { kind: "internal", name: "PubKeyHash" }
            }
        ]
    },
    {
        kind: "variant",
        id: "Validator",
        name: "Validator",
        tag: 1,
        fieldTypes: [
            {
                name: "hash",
                type: { kind: "internal", name: "StakingValidatorHash" }
            }
        ]
    }
]

export const SPENDING_CREDENTIAL_VARIANTS: VariantTypeSchema[] = [
    {
        kind: "variant",
        id: "PubKey",
        name: "PubKey",
        tag: 0,
        fieldTypes: [
            {
                name: "hash",
                type: { kind: "internal", name: "PubKeyHash" }
            }
        ]
    },
    {
        kind: "variant",
        id: "Validator",
        name: "Validator",
        tag: 1,
        fieldTypes: [
            {
                name: "hash",
                type: { kind: "internal", name: "ValidatorHash" }
            }
        ]
    }
]

export const TX_OUTPUT_DATUM_VARIANTS: VariantTypeSchema[] = [
    {
        kind: "variant",
        id: "None",
        name: "None",
        tag: 0,
        fieldTypes: []
    },
    {
        kind: "variant",
        id: "Hash",
        name: "Hash",
        tag: 1,
        fieldTypes: [
            {
                name: "hash",
                type: { kind: "internal", name: "DatumHash" }
            }
        ]
    },
    {
        kind: "variant",
        id: "Inline",
        name: "Inline",
        tag: 2,
        fieldTypes: [
            {
                name: "data",
                type: { kind: "internal", name: "Data" }
            }
        ]
    }
]

export function makeDefaultValue(schema: TypeSchema): string {
    const defaultFields = makeDefaultFieldValues(schema)

    const data = convertFieldsToUplcData(schema, defaultFields)

    return bytesToHex(data.toCbor())
}

export function makeNilValue(schema: TypeSchema): string {
    const nilFields = makeNilFieldValues(schema)

    const data = convertFieldsToUplcData(schema, nilFields)

    return bytesToHex(data.toCbor())
}

/**
 * Returns true if data conforms to schema
 * @param schema
 * @param data
 * @returns
 */
export function validateUplcData(schema: TypeSchema, data: UplcData): boolean {
    switch (schema.kind) {
        case "internal":
            switch (schema.name) {
                case "Bool":
                    return data.kind == "constr"
                case "ByteArray":
                    return data.kind == "bytes"
                case "Duration":
                case "Int":
                case "Real":
                    return data.kind == "int"
                case "Ratio":
                    return (
                        data.kind == "list" &&
                        data.items.length == 2 &&
                        data.items[0].kind == "int" &&
                        data.items[1].kind == "int"
                    )
                case "MintingPolicyHash":
                    return (
                        data.kind == "bytes" &&
                        (data.bytes.length == 28 || data.bytes.length == 0)
                    )
                case "String":
                    return data.kind == "bytes" && isValidUtf8(data.bytes)
                case "Time":
                    return data.kind == "int" && data.value >= 0n
                case "TimeRange": {
                    if (
                        !(
                            data.kind == "constr" &&
                            data.tag == 0 &&
                            data.fields.length == 2
                        )
                    ) {
                        return false
                    }

                    const start = data.fields[0]

                    if (
                        !(
                            start.kind == "constr" &&
                            start.tag == 0 &&
                            start.fields.length == 2
                        )
                    ) {
                        return false
                    }

                    const startValue = start.fields[0]

                    if (startValue.kind != "constr") {
                        return false
                    }

                    switch (startValue.tag) {
                        case 0:
                        case 2:
                            break
                        case 1:
                            if (
                                !(
                                    startValue.fields.length == 1 &&
                                    startValue.fields[0].kind == "int"
                                )
                            ) {
                                return false
                            }
                        default:
                            return false
                    }

                    if (
                        !validateUplcData(
                            { kind: "internal", name: "Bool" },
                            start.fields[1]
                        )
                    ) {
                        return false
                    }

                    const end = data.fields[1]

                    if (
                        !(
                            end.kind == "constr" &&
                            end.tag == 0 &&
                            end.fields.length == 2
                        )
                    ) {
                        return false
                    }

                    const endValue = end.fields[0]

                    if (endValue.kind != "constr") {
                        return false
                    }

                    switch (endValue.tag) {
                        case 0:
                        case 2:
                            break
                        case 1:
                            if (
                                !(
                                    endValue.fields.length == 1 &&
                                    endValue.fields[0].kind == "int"
                                )
                            ) {
                                return false
                            }
                        default:
                            return false
                    }

                    if (
                        !validateUplcData(
                            { kind: "internal", name: "Bool" },
                            end.fields[1]
                        )
                    ) {
                        return false
                    }

                    return true
                }
                case "ValidatorHash":
                    return data.kind == "bytes" && data.bytes.length == 28
                case "Value": {
                    if (data.kind != "map") {
                        return false
                    }

                    return data.items.every(([mph, tokens]) => {
                        if (
                            !validateUplcData(
                                { kind: "internal", name: "MintingPolicyHash" },
                                mph
                            )
                        ) {
                            return false
                        }

                        if (tokens.kind != "map") {
                            return false
                        }

                        return tokens.items.every(([name, qty]) => {
                            if (
                                name.kind != "bytes" ||
                                name.bytes.length > 32
                            ) {
                                return false
                            }

                            return qty.kind == "int"
                        })
                    })
                }
                default:
                    throw new Error(
                        `Unhandled internal type ${schema.name} in validateUplcData()`
                    )
            }
        case "list":
            if (data.kind != "list") {
                return false
            }

            return data.items.every((item) =>
                validateUplcData(schema.itemType, item)
            )
        case "map":
            if (data.kind != "map") {
                return false
            }

            return data.items.every(
                (item) =>
                    validateUplcData(schema.keyType, item[0]) &&
                    validateUplcData(schema.valueType, item[1])
            )
        case "option":
            if (data.kind != "constr") {
                return false
            }

            if (data.tag == 0) {
                return (
                    data.fields.length == 1 &&
                    validateUplcData(schema.someType, data.fields[0])
                )
            } else if (data.tag == 1) {
                return true
            } else {
                return false
            }
        case "enum": {
            if (data.kind != "constr") {
                return false
            }

            const tag = data.tag

            const variant = schema.variantTypes.find((v) => v.tag == tag)

            if (!variant) {
                return false
            }

            if (variant.fieldTypes.length > data.fields.length) {
                return false
            }

            return variant.fieldTypes.every((ft, i) => {
                return validateUplcData(ft.type, data.fields[i])
            })
        }
        case "variant": {
            if (data.kind != "constr") {
                return false
            }

            if (data.tag != schema.tag) {
                return false
            }

            if (schema.fieldTypes.length > data.fields.length) {
                return false
            }

            return schema.fieldTypes.every((ft, i) => {
                return validateUplcData(ft.type, data.fields[i])
            })
        }
        case "struct":
            switch (schema.format) {
                case "singleton":
                    return validateUplcData(schema.fieldTypes[0].type, data)
                case "list":
                    if (data.kind != "list") {
                        return false
                    }

                    if (schema.fieldTypes.length > data.items.length) {
                        return false
                    }

                    return schema.fieldTypes.every((ft, i) => {
                        return validateUplcData(ft.type, data.items[i])
                    })
                case "map":
                    if (data.kind != "map") {
                        return false
                    }

                    if (schema.fieldTypes.length > data.items.length) {
                        return false
                    }

                    return data.items.every(([key, value]) => {
                        if (key.kind != "bytes" || !isValidUtf8(key.bytes)) {
                            return false
                        }

                        const fieldName = decodeUtf8(key.bytes)

                        const fieldType = schema.fieldTypes.find(
                            (ft) => ft.name == fieldName
                        )

                        if (!fieldType) {
                            return false
                        }

                        return validateUplcData(fieldType.type, value)
                    })
            }
        case "tuple":
            if (data.kind != "list") {
                return false
            }

            if (schema.itemTypes.length > data.items.length) {
                return false
            }

            return schema.itemTypes.every((it, i) => {
                return validateUplcData(it, data.items[i])
            })
        case "reference":
            throw new Error(
                "Reference type schema not handled in validateUplcDate()"
            )
    }
}

export function genDummyHash(validatorName: string): string {
    return bytesToHex(blake2b(encodeUtf8(validatorName), 28))
}
