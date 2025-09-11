import {
    ArgInput,
    ScriptContextInput,
    Select,
    useClickError,
    useChangeEntryPoint,
    useContextKey,
    useStoreHelper,
    useTypeSchemas,
    useVsCodeApi
} from "components"
import { ReactNode, StrictMode, useCallback, useId, useMemo } from "react"
import { createRoot } from "react-dom/client"
import { ErrorBoundary } from "react-error-boundary"
import {
    ArgsPanelEntryPoint,
    ChangeFieldValueEvent,
    makeDefaultValue,
    tryResolveSchema
} from "schemas"
import { bytesToHex } from "@helios-lang/codec-utils"
import { decodeUplcData, makeConstrData } from "@helios-lang/uplc"
import { expectDefined } from "@helios-lang/type-utils"
import { useArgsPanelContext } from "./useArgsPanelContext"

import "components/styles.module.css"
import styles from "./styles.module.css"

const root = document.getElementById("root") as HTMLElement

createRoot(root).render(
    <StrictMode>
        <ErrorBoundary FallbackComponent={ErrorMessage}>
            <Main />
        </ErrorBoundary>
    </StrictMode>
)

function Main() {
    const context = useArgsPanelContext()
    const changeEntryPoint = useChangeEntryPoint()
    const entryPointsSelectId = useId()

    if (!context) {
        return <Loading />
    }

    if (context.errorUris.length > 0) {
        return <CompilationErrors errorLocations={context.errorUris} />
    }

    if (context.allEntryPoints.length == 0) {
        return (
            <div>
                <p>
                    No entry points found in{" "}
                    <FileName uri={context.moduleUri} />
                </p>
            </div>
        )
    }

    if (!context.entryPoint) {
        return <Loading />
    }

    return (
        <Form>
            <FormRow>
                <label htmlFor={entryPointsSelectId}>
                    Entry point of <FileName uri={context.moduleUri} />
                </label>
                <Select
                    id={entryPointsSelectId}
                    value={context.entryPoint.name}
                    options={context.allEntryPoints}
                    onChange={changeEntryPoint}
                />
            </FormRow>

            <EntryPointForm
                entryPointInfo={context.entryPoint}
                allValidators={context.allValidators}
            />
        </Form>
    )
}

type FormProps = {
    children: ReactNode
}

function Form({ children }: FormProps) {
    return <div className={styles.form}>{children}</div>
}

type FormRowProps = {
    children: ReactNode
}

function FormRow({ children }: FormRowProps) {
    return <div className={styles.formRow}>{children}</div>
}

type FormSectionProps = {
    children: ReactNode
}

function FormSection({ children }: FormSectionProps) {
    return <div className={styles.formSection}>{children}</div>
}

type ErrorMessageProps = {
    error: Error
}

function ErrorMessage({ error }: ErrorMessageProps) {
    return <p className={styles.error}>{error.message}</p>
}

function Loading() {
    return <p>Loading...</p>
}

type CompilationErrorsProps = {
    errorLocations: readonly string[]
}

function CompilationErrors({
    errorLocations: errorUris
}: CompilationErrorsProps) {
    return (
        <div>
            <p className={styles.error}>
                Compilation errors in{" "}
                <HumanReadableList
                    elements={errorUris.map((uri) => (
                        <FileLink key={uri} uri={uri} />
                    ))}
                />
            </p>
        </div>
    )
}

type HumanReadableListProps = {
    elements: Array<ReactNode>
}

function HumanReadableList({ elements }: HumanReadableListProps) {
    return (
        <>
            {elements.map((element, i) => {
                return (
                    <>
                        {element}
                        {i < elements.length - 2
                            ? ", "
                            : i < elements.length - 1
                              ? " and "
                              : ""}
                    </>
                )
            })}
        </>
    )
}

type FileLinkProps = {
    uri: string
}

function FileLink({ uri }: FileLinkProps) {
    const goToError = useClickError(uri)

    return (
        <a className={styles.link} onClick={goToError}>
            <FileName uri={uri} />
        </a>
    )
}

type FileNameProps = {
    uri: string
}

function FileName({ uri }: FileNameProps) {
    const fileName = basename(uri)
    return <span className={styles.path}>{fileName}</span>
}

function basename(path: string): string {
    return path.split(/[/\\]/).pop() ?? path
}

type EntryPointFormProps = {
    allValidators: readonly { name: string; purpose: string }[] // TODO: as hook
    entryPointInfo: ArgsPanelEntryPoint
}

function EntryPointForm({
    allValidators,
    entryPointInfo
}: EntryPointFormProps) {
    const contextKey = useContextKey()

    // use the store as a kind of cache
    const store = useStoreHelper()
    const schemas = useTypeSchemas()

    const [argValues, scriptContextValue] = useMemo(() => {
        const argValues: Record<string, string> = {}

        for (let a of entryPointInfo.args) {
            const value = store.getFieldValue(contextKey, a.name)

            if (value) {
                argValues[a.name] = value
            } else {
                const schema = tryResolveSchema(schemas, a.type)
                if (schema) {
                    argValues[a.name] = makeDefaultValue(schema)
                }
            }
        }

        const scriptContextValue = store.getFieldValue(
            contextKey,
            "ScriptContext"
        )

        return [argValues, scriptContextValue]
    }, [entryPointInfo, store, contextKey, schemas])

    if (
        Object.keys(argValues).length < Object.keys(entryPointInfo.args).length
    ) {
        return <Loading />
    }

    return (
        <FormSection>
            {entryPointInfo.args
                .filter((a) => a.name != "_")
                .map((a) => {
                    return (
                        <FormRow key={a.name}>
                            <ArgInput
                                fieldName={a.name}
                                fieldType={a.type}
                                fieldValue={expectDefined(
                                    argValues[a.name],
                                    `Arg value ${a.name} undefined`
                                )}
                            />
                        </FormRow>
                    )
                })}

            {entryPointInfo.needsScriptContext && (
                <FormRow>
                    <ScriptContextInput value={scriptContextValue} />
                </FormRow>
            )}

            {entryPointInfo.needsCurrentValidator && (
                <SelectCurrentValidator allValidators={allValidators} />
            )}
        </FormSection>
    )
}

type SelectCurrentValidatorProps = {
    allValidators: readonly { name: string; purpose: string }[]
}

function SelectCurrentValidator({
    allValidators
}: SelectCurrentValidatorProps) {
    const contextKey = useContextKey()
    const vscode = useVsCodeApi()
    const store = useStoreHelper()

    const currentValidatorName = useMemo(() => {
        const currentValidatorValue = store.getFieldValue(
            contextKey,
            "::CurrentValidator"
        ) // cbor hex of validator

        if (!currentValidatorValue) {
            return allValidators[0].name
        }

        const constrData = decodeUplcData(currentValidatorValue)

        if (constrData.kind != "constr") {
            return allValidators[0].name
        }

        const tag = constrData.tag

        const name = allValidators[tag]?.name

        if (!name) {
            return allValidators[0].name
        }

        return name
    }, [store, contextKey, allValidators])

    const handleSelectCurrentValidator = useCallback(
        (value: string) => {
            const i = allValidators.findIndex((v) => v.name == value)
            if (i == -1) {
                return
            }

            vscode.postMessage({
                kind: "ChangeFieldValue",
                contextKey,
                fieldName: "::CurrentValidator",
                fieldType: "",
                fieldValue: bytesToHex(makeConstrData(i, []).toCbor())
            } satisfies ChangeFieldValueEvent)
        },
        [vscode, contextKey, allValidators]
    )

    return (
        <FormRow>
            <label>Current validator</label>
            <Select
                options={allValidators.map((v) => v.name)}
                value={currentValidatorName}
                onChange={handleSelectCurrentValidator}
            />
        </FormRow>
    )
}
