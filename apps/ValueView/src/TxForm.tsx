import { ArgInput } from "components"
import { BuiltinStructForm } from "./BuiltinStructForm"
import { StructTypeSchema } from "@helios-lang/type-utils"

type TxFormProps = {
    fields: Record<string, string>
}

const TX_SCHEMA: StructTypeSchema = {
    kind: "struct",
    id: "Tx",
    name: "Tx",
    format: "list", // doesn't matter
    fieldTypes: [
        {
            name: "inputs",
            type: {
                kind: "list",
                itemType: {kind: "internal", name: "TxInput"}
            }
        },
        {
            name: "ref_inputs",
            type: {
                kind: "list",
                itemType: {kind: "internal", name: "TxInput"}
            }
        },
        {
            name: "outputs",
            type: {
                kind: "list",
                itemType: {kind: "internal", name: "TxOutput"}
            }
        },
        {
            name: "fee",
            type: {kind: "internal", name: "Value"}
        },
        {
            name: "minted",
            type: {kind: "internal", name: "Value"}
        },
        {
            name: "dcerts",
            type: {
                kind: "list",
                itemType: {kind: "internal", name: "DCert"}
            }
        },
        {
            name: "withdrawals",
            type: {
                kind: "map",
                keyType: {kind: "internal", name: "StakingCredential"},
                valueType: {kind: "internal", name: "Int"}
            }
        },
        {
            name: "time_range",
            type: {kind: "internal", name: "TimeRange"}
        },
        {
            name: "signatories",
            type: {
                kind: "list",
                itemType: {kind: "internal", name: "PubKeyHash"}
            }
        },
        {
            name: "redeemers",
            type: {
                kind: "map",
                keyType: {kind: "internal", name: "ScriptPurpose"},
                valueType: {kind: "internal", name: "Data"}
            }
        },
        {
            name: "datums",
            type: {
                kind: "map",
                keyType: {kind: "internal", name: "DatumHash"},
                valueType: {kind: "internal", name: "Data"}
            }
        },
        {
            name: "id",
            type: {kind: "internal", name: "TxId"}
        }
    ]
}

export function TxForm({ fields }: TxFormProps) {
    return <BuiltinStructForm schema={TX_SCHEMA} fields={fields} />
}
