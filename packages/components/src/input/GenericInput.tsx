import { ReactNode, useCallback, useMemo } from "react"
import { ArgLabel } from "./ArgLabel"
import styles from "./styles.module.css"
import { Select } from "./Select"
import { useVsCodeApi } from "../vscode"
import {
    CreateValueEvent,
    makeNilValue,
    makeUniqueValueName,
    resolveSchema,
    type EditValueEvent
} from "schemas"
import { useChangeFieldValue } from "../events"
import { useStoreHelper, useTypeSchemas, useContextKey } from "../context"

type GenericInputProps = {
    fieldName: string
    fieldType: string
    fieldValue: string
}

function makeCreateMessage(type: string): string {
    return `Create new ${type} value`
}

export function GenericInput({
    fieldName,
    fieldType,
    fieldValue
}: GenericInputProps) {
    const contextKey = useContextKey()
    const vscode = useVsCodeApi()
    const store = useStoreHelper()
    const typeSchemas = useTypeSchemas()
    const changeValue = useChangeFieldValue()
    const preferValueName = store.getPreferredValueName(contextKey, fieldName)

    // nil is always available
    const options = useMemo(() => {
        return store.getTypeOptionsWithNIL(fieldType)
    }, [store, fieldType])

    const initialValueName = useMemo(() => {
        if (!fieldValue) {
            return undefined
        }

        // TODO: get preferred name from store
        if (
            preferValueName &&
            store.getValue(fieldType, preferValueName) == fieldValue
        ) {
            return preferValueName
        }

        const schema = resolveSchema(typeSchemas, fieldType)

        if (makeNilValue(schema) == fieldValue) {
            return "NIL"
        }

        // look for value in store, if it appears, use the associated name
        const cborHex = fieldValue

        if (fieldType in store) {
            const valueNames = store.findValueNames(fieldType, cborHex)

            if (valueNames.length == 0) {
                return undefined
            } else if (valueNames.length == 1) {
                return valueNames[0]
            } else if (preferValueName) {
                const i = valueNames.indexOf(preferValueName)

                if (i != -1) {
                    return valueNames[i]
                } else {
                    return valueNames[0]
                }
            } else {
                return valueNames[0]
            }
        }

        // if not found, then we must create a unique name, and restore the value in the store
        // but that should be done in an effect
        return undefined
    }, [store, fieldType, options, fieldValue, typeSchemas, preferValueName])

    const handleCreate = useCallback(
        (uniqueName: string) => {
            const event: CreateValueEvent = {
                kind: "CreateValue",
                typeName: fieldType,
                valueName: uniqueName,
                callerContextKey: contextKey,
                callerFieldName: fieldName,
                linkToCaller: true
            }

            vscode.postMessage(event)
        },
        [vscode, fieldName, store, fieldType, contextKey]
    )

    const handleSelect = useCallback(
        (valueName: string) => {
            if (valueName == makeCreateMessage(fieldType)) {
                const uniqueName = makeUniqueValueName(store.values, fieldType)
                handleCreate(uniqueName)
            } else {
                if (valueName == "NIL") {
                    const schema = resolveSchema(typeSchemas, fieldType)
                    changeValue({
                        fieldName,
                        fieldType,
                        fieldValue: makeNilValue(schema)
                    })
                } else {
                    const valueCborHex = store.getValue(fieldType, valueName)

                    if (valueCborHex) {
                        changeValue({
                            fieldName,
                            fieldType,
                            fieldValue: valueCborHex,
                            link: `${fieldType}::${valueName}`
                        })
                    }
                }
            }
        },
        [
            store,
            fieldType,
            fieldName,
            fieldValue,
            changeValue,
            typeSchemas,
            handleCreate
        ]
    )

    const optionsWithCreate = useMemo(() => {
        return options.concat(makeCreateMessage(fieldType))
    }, [options, fieldType])

    const handleEdit = useCallback(() => {
        if (initialValueName) {
            const event: EditValueEvent = {
                kind: "EditValue",
                typeName: fieldType,
                valueName: initialValueName,
                callerContextKey: contextKey,
                callerFieldName: fieldName
            }

            vscode.postMessage(event)
        }
    }, [vscode, fieldType, initialValueName, contextKey])

    return (
        <>
            <ArgLabel name={fieldName} type={fieldType} />
            <div className={styles.genericInputRow}>
                <Select
                    value={initialValueName}
                    className={styles.notFullWidth}
                    options={optionsWithCreate}
                    onChange={handleSelect}
                />
                <GenericInputAction
                    onClick={handleEdit}
                    disabled={initialValueName == "NIL"}
                >
                    <PencilIcon />
                </GenericInputAction>
            </div>
            <p>Prefer: {preferValueName}</p>
        </>
    )
}

type GenericInputActionProps = {
    children: ReactNode
    disabled?: boolean
    onClick: () => void
}

export function GenericInputAction({
    children,
    disabled,
    onClick
}: GenericInputActionProps) {
    return (
        <button
            className={styles.genericInputAction}
            onClick={onClick}
            disabled={disabled}
        >
            {children}
        </button>
    )
}

function PencilIcon() {
    return (
        <svg
            className={styles.icon}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
        >
            <path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
        </svg>
    )
}

export function TrashCanIcon() {
    return (
        <svg
            className={styles.icon}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
        >
            <g transform="translate(12 12) scale(1.2) translate(-12 -12)">
                <path d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z" />
            </g>
        </svg>
    )
}

export function ThickPlusIcon() {
    return (
        <svg
            className={styles.icon}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
        >
            <path d="M20 14H14V20H10V14H4V10H10V4H14V10H20V14Z" />
        </svg>
    )
}

export function ThickMinusIcon() {
    return (
        <svg
            className={styles.icon}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
        >
            <path d="M20 14H4V10H20" />
        </svg>
    )
}
