import {
    IconButton,
    TrashCanIcon,
    useChangeValueName,
    useContextKey,
    useStoreHelper,
    useTypeSchemas,
    useVsCodeApi,
    ValidatedInput
} from "components"
import { ChangeEvent, StrictMode, useCallback, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { ErrorBoundary } from "react-error-boundary"
import {
    DeleteValueEvent,
    tryResolveSchema,
    type ValuePanelContext
} from "schemas"
import { TypeSchema } from "@helios-lang/type-utils"
import { EnumForm } from "./EnumForm"
import { ListForm } from "./ListForm"
import { MapForm } from "./MapForm"
import { OptionForm } from "./OptionForm"
import { StructForm } from "./StructForm"
import { TupleForm } from "./TupleForm"
import { TxForm } from "./TxForm"
import { useValuePanelContext } from "./useValuePanelContext"

import "components/styles.module.css"
import styles from "./styles.module.css"
import { AssetClassForm } from "./AssetClassForm"
import { MintingPolicyHashForm } from "./MintingPolicyHashForm"
import { useReservedNames } from "./useReservedNames"
import { PubKeyHashForm } from "./PubKeyHashForm"
import { DatumHashForm } from "./DatumHashForm"
import { ValidatorHashForm } from "./ValidatorHashForm"
import { StakingValidatorHashForm } from "./StakingValidatorHashForm"
import { SpendingCredentialForm } from "./SpendingCredentialForm"
import { StakingHashForm } from "./StakingHashForm"
import { StakingCredentialForm } from "./StakingCredentialForm"
import { PubKeyForm } from "./PubKeyForm"
import { TxOutputIdForm } from "./TxOutputIdForm"
import { TxInputForm } from "./TxInputForm"
import { TxOutputForm } from "./TxOutputForm"
import { DCertForm } from "./DCertForm"
import { TxOutputDatumForm } from "./TxOutputDatumForm"
import { ScriptPurposeForm } from "./ScriptPurposeForm"
import { DataForm } from "./DataForm"

const root = document.getElementById("root") as HTMLElement

createRoot(root).render(
    <StrictMode>
        <ErrorBoundary FallbackComponent={ErrorMessage}>
            <Main />
        </ErrorBoundary>
    </StrictMode>
)

function Main() {
    const context = useValuePanelContext()
    const schemas = useTypeSchemas()
    const schema = useMemo(() => {
        if (!context) {
            return undefined
        }
        return tryResolveSchema(schemas, context.typeName)
    }, [schemas, context])

    if (!context) {
        return <p>Loading context...</p>
    } else if (!schema) {
        return <p>Loading type schema...</p>
    }

    return (
        <div className={styles.main}>
            <div className={styles.header}>
                <h2>{context.typeName} value</h2>
                <DeleteButton />
            </div>

            <NameInput context={context} />

            <MainInternal context={context} schema={schema} />
        </div>
    )
}

function DeleteButton() {
    const vscode = useVsCodeApi()
    const context = useValuePanelContext()

    const handleDelete = useCallback(() => {
        if (!context) {
            return
        }

        vscode.postMessage({
            kind: "DeleteValue",
            typeName: context.typeName,
            valueName: context.valueName
        } satisfies DeleteValueEvent)
    }, [vscode, context])

    return (
        <IconButton onClick={handleDelete}>
            <TrashCanIcon />
        </IconButton>
    )
}

type NameInputProps = {
    context: ValuePanelContext
}

function NameInput({ context }: NameInputProps) {
    const store = useStoreHelper()
    const [error, setError] = useState("")
    const [name, setName] = useState(context.valueName)
    const changeName = useChangeValueName()
    const reservedNames = useReservedNames(context)

    const handleChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const newName = event.target.value.trim()
            setName(newName)
            
            if (reservedNames.has(newName)) {
                setError(`'${newName}' is reserved`)
            } else if (newName == "") {
                setError("empty")
            } else if (store.hasValue(`${context.typeName}::${newName}`)) {
                // TODO: detect when it is the same or another value
                setError(`'${newName}' already used`)
            } else if (
                newName.includes(" ") ||
                newName.includes("\t") ||
                newName.includes("\n")
            ) {
                setError(`contains whitespace`)
            } else if (newName.match(/[^a-zA-Z0-9_\-]/)) {
                setError(`contains illegal characters`)
            } else {
                setError("")
                changeName(newName)
            }
        },
        [context, store, setError, setName, changeName, reservedNames]
    )

    return (
        <>
            <label>
                <h3>Name</h3>
            </label>

            <ValidatedInput
                value={name}
                onChange={handleChange}
                error={error}
            />
        </>
    )
}

type MainInternalProps = {
    context: ValuePanelContext
    schema: TypeSchema
}

function MainInternal({ context, schema }: MainInternalProps) {
    const store = useStoreHelper()
    const contextKey = useContextKey()

    const type = context.typeName

    const valueFields = useMemo(() => {
        return store.getFields(contextKey)
    }, [store, contextKey, schema])

    if (!valueFields) {
        return <p>Loading value...</p>
    }

    switch (schema.kind) {
        case "internal":
            switch (schema.name) {
                case "Address":
                    return 
                case "AssetClass":
                    return <AssetClassForm fields={valueFields} />
                case "Data":
                    return <DataForm fields={valueFields} />
                case "DatumHash":
                    return <DatumHashForm fields={valueFields} />
                case "DCert":
                    return <DCertForm fields={valueFields} />
                case "MintingPolicyHash":
                    return <MintingPolicyHashForm fields={valueFields} />
                case "PubKey":
                    return <PubKeyForm fields={valueFields} />
                case "PubKeyHash":
                    return <PubKeyHashForm fields={valueFields} />
                case "ScriptPurpose":
                    return <ScriptPurposeForm fields={valueFields} />
                case "SpendingCredential":
                    return <SpendingCredentialForm fields={valueFields} />
                case "StakingCredential":
                    return <StakingCredentialForm fields={valueFields} />
                case "StakingHash":
                    return <StakingHashForm fields={valueFields} />
                case "StakingValidatorHash":
                    return <StakingValidatorHashForm fields={valueFields} />
                case "Tx":
                    return <TxForm fields={valueFields} />
                case "TxInput":
                    return <TxInputForm fields={valueFields} />
                case "TxOutput":
                    return <TxOutputForm fields={valueFields} />
                case "TxOutputDatum":
                    return <TxOutputDatumForm fields={valueFields} />
                case "TxOutputId":
                    return <TxOutputIdForm fields={valueFields} />
                case "ValidatorHash":
                    return <ValidatorHashForm fields={valueFields} />
                default:
                    return <p>Unhandled internal type '{schema.name}'</p>
            }
        case "enum":
            return <EnumForm schema={schema} fields={valueFields} />
        case "list":
            return <ListForm schema={schema} fields={valueFields} />
        case "map":
            return <MapForm schema={schema} fields={valueFields} />
        case "option":
            return <OptionForm schema={schema} fields={valueFields} />
        case "variant":
        case "struct":
            return <StructForm schema={schema} fields={valueFields} />
        case "tuple":
            return <TupleForm schema={schema} fields={valueFields} />
        default:
            return <p>Unhandled type '{type}'</p>
    }
}

type ErrorMessageProps = {
    error: Error
}

function ErrorMessage({ error }: ErrorMessageProps) {
    return <p>{error.message}</p>
}
