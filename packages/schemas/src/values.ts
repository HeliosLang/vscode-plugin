import { bytesToHex, encodeUtf8 } from "@helios-lang/codec-utils"
import {
    expectDefined,
    FieldTypeSchema,
    type TypeSchema
} from "@helios-lang/type-utils"
import {
    decodeUplcData,
    makeByteArrayData,
    makeConstrData,
    makeIntData,
    makeListData,
    makeMapData,
    type UplcData
} from "@helios-lang/uplc"

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
    "Bool",
    "ByteArray",
    "Int",
    "MintingPolicyHash",
    "PubKey",
    "PubKeyHash",
    "Ratio",
    "Real",
    "ScriptContext",
    "Tx",
    "TxInput",
    "TxOutput",
    "ValidatorHash"
]

export function resolveSchema(
    schemas: Record<string, TypeSchema>,
    typeName: string
): TypeSchema {
    if (typeName in schemas) {
        return schemas[typeName]
    } else if (BUILTIN_TYPES.includes(typeName)) {
        return { kind: "internal", name: typeName }
    } else if (typeName.startsWith("[]")) {
        const itemTypeName = typeName.slice(2)

        return {
            kind: "list",
            itemType: resolveSchema(schemas, itemTypeName)
        }
    } else if (typeName.startsWith("Map[")) {
        const [keyTypeName, ...valueTypeNameParts] = typeName
            .slice(4)
            .split("]")[0]
        const valueTypeName = valueTypeNameParts.join("]")

        return {
            kind: "map",
            keyType: resolveSchema(schemas, keyTypeName),
            valueType: resolveSchema(schemas, valueTypeName)
        }
    } else if (typeName.startsWith("Option[")) {
        const someTypeName = typeName.slice(7).split("]")[0]

        return {
            kind: "option",
            someType: resolveSchema(schemas, someTypeName)
        }
    } else if (typeName.startsWith("(") && typeName.endsWith(")")) {
        // TODO: this doesn't work for nested types!, need actual token parsing
        const itemTypeNames = typeName.slice(1, typeName.length - 1).split(",")

        return {
            kind: "tuple",
            itemTypes: itemTypeNames.map((itemType) =>
                resolveSchema(schemas, itemType)
            )
        }
    } else {
        throw new Error(`Unable to resolve schema of ${typeName}`)
    }
}

function encodeBool(b: boolean): string {
    return bytesToHex(makeConstrData(b ? 1 : 0, []).toCbor())
}

function encodeByteArray(bs: number[]): string {
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
                case "Bool":
                    return { value: encodeBool(true) }
                case "Int":
                    return { value: encodeInt(42) }
                case "Real":
                    return { value: encodeInt(3_141_592) }
                default:
                    throw new Error(`Unhandled internal type ${schema.name}`)
            }
        }
        case "list":
            if (schema.itemType.kind == "internal") {
                switch (schema.itemType.name) {
                    case "Bool":
                        return DEFAULT_BOOL_LIST_FIELDS
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
                case "Bool":
                    return { value: encodeBool(false) }
                case "ByteArray":
                    return { value: encodeByteArray([]) }
                case "Int":
                case "Real":
                    return { value: encodeInt(0) }
                case "Ratio":
                    return { value: encodeRatio(0, 0) }
                case "String":
                    return { value: encodeString("") }
                default:
                    throw new Error(`Unhandled internal type ${schema.name}`)
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

function convertFieldsToUplcDataFields(
    fields: Record<string, string>,
    fieldTypes: FieldTypeSchema[]
): UplcData[] {
    const result: UplcData[] = []

    for (let ft of fieldTypes) {
        result.push(decodeUplcData(fields[ft.name]))
    }

    return result
}

function convertFieldsToUplcDataList(
    fields: Record<string, string>
): UplcData[] {
    const result: UplcData[] = []

    for (let i = 0; true; i++) {
        const field = fields[`item-${i}`]

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
            return decodeUplcData(fields.value)
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
                convertFieldsToUplcDataFields(fields, schema.fieldTypes)
            )
        case "struct": {
            const dataFields = convertFieldsToUplcDataFields(
                fields,
                schema.fieldTypes
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
                fields,
                variant.fieldTypes
            )
            return makeConstrData(tag, dataFields)
        case "reference":
            throw new Error(
                `Reference type schema unhandledin convertFieldsToUplcData`
            )
    }
}

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
