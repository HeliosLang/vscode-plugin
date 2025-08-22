import {
    ChangeEvent,
    ReactNode,
    StrictMode,
    useCallback,
    useEffect,
    useId,
    useState
} from "react"
import { createRoot } from "react-dom/client"
import { ErrorBoundary } from "react-error-boundary"
import { EntryPointViewContext, FileViewContext } from "schemas"
import { bytesToHex, encodeUtf8 } from "@helios-lang/codec-utils"
import { makeByteArrayData, makeIntData, makeListData } from "@helios-lang/uplc"
import { useEntryPointViewContext, useFileViewContext } from "./context"

import styles from "./styles.module.css"
import { useChangeArgValue, useGoToError, useSelectEntryPoint } from "./events"

const root = document.getElementById("root") as HTMLElement

createRoot(root).render(
    <StrictMode>
        <ErrorBoundary FallbackComponent={ErrorMessage}>
            <Main />
        </ErrorBoundary>
    </StrictMode>
)

function Main() {
    const fileContext = useFileViewContext()
    const entryPointContext = useEntryPointViewContext()
    const selectEntryPoint = useSelectEntryPoint()
    const entryPointsSelectId = useId()

    const isLoadingFileContext = !fileContext || fileContext.isLoading
    const isLoadingEntryPointContext =
        !entryPointContext || isLoadingFileContext

    if (isLoadingFileContext) {
        // TODO: spinner
        return <Loading />
    }

    if (fileContext.errorUris.length > 0) {
        return <CompilationErrors errorLocations={fileContext.errorUris} />
    }

    if (fileContext.entryPoints.length == 0) {
        return (
            <div>
                <p>
                    No entry points found in <FileName uri={fileContext.uri} />
                </p>
            </div>
        )
    }

    return (
        <Form>
            <FormRow>
                <label htmlFor={entryPointsSelectId}>
                    Entry point of <FileName uri={fileContext.uri} />
                </label>
                <Select
                    id={entryPointsSelectId}
                    keys={[fileContext.uri]}
                    options={fileContext.entryPoints}
                    onChange={selectEntryPoint}
                />
            </FormRow>

            {isLoadingEntryPointContext ? (
                <Loading />
            ) : (
                <EntryPointForm
                    context={entryPointContext}
                    fileContext={fileContext}
                />
            )}
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
    const goToError = useGoToError(uri)

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

type SelectProps = {
    id?: string
    keys: string[]
    options: readonly string[] // has at least one entry
    onChange: (value: string) => void
}

function Select({ id, keys, options, onChange }: SelectProps) {
    const firstOption = options[0]
    const [selected, setSelected] = useState(firstOption)

    useEffect(() => {
        if (options.length > 0) {
            setSelected(options[0])
            onChange(options[0])
        }
    }, [onChange, ...keys])

    const handleChange = useCallback(
        (e: ChangeEvent<HTMLSelectElement>) => {
            const value = e.target.value
            setSelected(value)
            onChange(value)
        },
        [onChange, setSelected]
    )

    return (
        <select id={id} value={selected} onChange={handleChange}>
            {options.map((opt) => (
                <option key={opt} value={opt}>
                    {opt}
                </option>
            ))}
        </select>
    )
}

type EntryPointFormProps = {
    context: EntryPointViewContext
    fileContext: FileViewContext
}

function EntryPointForm({ context, fileContext }: EntryPointFormProps) {
    const handleSelectCurrentValidator = useCallback((value: string) => {
        console.log(value)
    }, [])

    return (
        <FormSection>
            {context.arguments
                .filter((a) => a.name != "_")
                .map((a) => {
                    // TODO: input component based on type
                    return (
                        <FormRow key={a.name}>
                            <ArgInput name={a.name} type={a.type} />
                        </FormRow>
                    )
                })}

            {context.needsScriptContext && (
                <FormRow>
                    <label>ScriptContext</label>
                    <textarea></textarea>
                </FormRow>
            )}

            {context.needsCurrentValidator && (
                <FormRow>
                    <label>Current validator</label>
                    <Select
                        keys={[context.name, fileContext.uri]}
                        options={fileContext.allValidatorNames}
                        onChange={handleSelectCurrentValidator}
                    />
                </FormRow>
            )}
        </FormSection>
    )
}

type ArgInputProps = {
    name: string
    type: string // e.g. "Int", or "[]Int"
}

function ArgInput({ name, type }: ArgInputProps) {
    switch (type) {
        case "Int":
            return <IntArgInput name={name} />
        case "Ratio":
            return <RatioArgInput name={name} />
        case "String":
            return <StringArgInput name={name} />
        case "Bool":
        default:
            return <p>Unsupported arg type {type}</p>
    }
}

function validateInt(value: string): string {
    const trimmed = value.trim()

    if (trimmed == "") {
        return "Empty"
    }

    if (Number.isNaN(trimmed) || BigInt(trimmed).toString() != trimmed) {
        return "Invalid format"
    }

    return ""
}

function isValidInt(value: string): boolean {
    return validateInt(value) == ""
}

type IntArgInputProps = {
    name: string
}

function IntArgInput({ name }: IntArgInputProps) {
    const t = "Int"

    const [value, setValue] = useState("42") // can be invalid
    const changeArgValue = useChangeArgValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            setValue(evt.target.value)
        },
        [setValue]
    )

    useEffect(() => {
        const dataHex = isValidInt(value)
            ? bytesToHex(makeIntData(parseInt(value)).toCbor())
            : undefined
        changeArgValue(name, t, dataHex)
    }, [name, value, changeArgValue])

    const error = validateInt(value)

    return (
        <>
            <ArgLabel name={name} type={t} />
            <ValidatedInput
                value={value}
                onChange={handleChange}
                error={error}
            />
        </>
    )
}

function validateRatio(value: string): string {
    const trimmed = value.trim()

    if (trimmed == "") {
        return "Empty"
    }

    const parts = trimmed.split("/")

    if (parts.length == 1) {
        return "Missing '/'"
    }

    if (parts.length > 2) {
        return "Too many '/'"
    }

    const trimmedTop = parts[0].trim()

    if (trimmedTop == "") {
        return "Empty numerator"
    }

    if (
        Number.isNaN(parseInt(trimmedTop)) ||
        BigInt(trimmedTop).toString() != trimmedTop
    ) {
        return "Invalid numerator format"
    }

    const trimmedBottom = parts[1].trim()

    if (trimmedBottom == "") {
        return "Empty denominator"
    }

    if (
        Number.isNaN(parseInt(trimmedBottom)) ||
        BigInt(trimmedBottom).toString() != trimmedBottom
    ) {
        return "Invalid denominator format"
    }

    return ""
}

function isValidRatio(value: string): boolean {
    return validateRatio(value) == ""
}

type RatioArgInputProps = {
    name: string
}

function RatioArgInput({ name }: RatioArgInputProps) {
    const t = "Ratio"

    const [value, setValue] = useState("2/3") // can be invalid
    const changeArgValue = useChangeArgValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            setValue(evt.target.value)
        },
        [setValue]
    )

    useEffect(() => {
        let dataHex: string | undefined = undefined

        if (isValidRatio(value)) {
            const [rt, rb] = value.split("/")

            let t = BigInt(rt)
            let b = BigInt(rb)

            if (b < 0n) {
                t *= -1n
                b *= -1n
            }

            dataHex = bytesToHex(
                makeListData([
                    makeIntData(BigInt(t)),
                    makeIntData(BigInt(b))
                ]).toCbor()
            )
        }

        changeArgValue(name, t, dataHex)
    }, [name, value, changeArgValue])

    const error = validateRatio(value)

    return (
        <>
            <ArgLabel name={name} type={t} />
            <ValidatedInput
                value={value}
                onChange={handleChange}
                error={error}
            />
        </>
    )
}

type StringArgInputProps = {
    name: string
}

function StringArgInput({ name }: StringArgInputProps) {
    const t = "String"

    const [value, setValue] = useState("hello world")
    const changeArgValue = useChangeArgValue()

    const handleChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            setValue(evt.target.value)
        },
        [name, setValue]
    )

    useEffect(() => {
        const dataHex = bytesToHex(
            makeByteArrayData(encodeUtf8(value)).toCbor()
        )

        changeArgValue(name, t, dataHex)
    }, [name, value, changeArgValue])

    return (
        <>
            <ArgLabel name={name} type={t} />
            <ValidatedInput value={value} onChange={handleChange} error="" />
        </>
    )
}

type ArgLabelProps = {
    name: string
    type: string
}

function ArgLabel({ name, type }: ArgLabelProps) {
    return (
        <label className={styles.argLabel}>
            <span>{name}</span>: <span>{type}</span>
        </label>
    )
}

type ValidatedInputProps = {
    value: string
    onChange: (evt: ChangeEvent<HTMLInputElement>) => void
    error: string
    placeholder?: string
}

function ValidatedInput({
    value,
    onChange,
    error,
    placeholder
}: ValidatedInputProps) {
    const isValid = error == ""

    return (
        <div className={styles.validatedInputWrapper}>
            <input
                className={isValid ? "" : styles.invalidInput}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
            />
            <p
                className={
                    isValid
                        ? styles.invisibleInputError
                        : styles.visibleInputError
                }
            >
                {error}
            </p>
        </div>
    )
}
