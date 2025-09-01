import { ReactNode, useCallback, useMemo } from "react"
import {
    makeNilValue,
    makeUniqueValueName,
    tryResolveSchema,
    type EditValueEvent
} from "schemas"
import { useStoreHelper, useTypeSchemas, useContextKey } from "../context"
import { useChangeFieldValue, useCreateValue } from "../events"
import { PencilIcon } from "../icons/PencilIcon"
import { useVsCodeApi } from "../vscode"
import { ArgLabel } from "./ArgLabel"
import { Select } from "./Select"

import styles from "./styles.module.css"
import { IconButton } from "./IconButton"

type GenericInputProps = {
    fieldName: string
    fieldType: string
    fieldValue: string
    label?: ReactNode
}

export function makeCreateMessage(type: string): string {
    return `Create new ${type} value`
}

export const DEFAULT_VALUE_NAME = "NIL"

export function GenericInput({
    fieldName,
    fieldType,
    fieldValue,
    label
}: GenericInputProps) {
    const contextKey = useContextKey()
    const vscode = useVsCodeApi()
    const store = useStoreHelper()

    // NIL is always available
    const options = useMemo(() => {
        return store
            .getTypeOptions(fieldType)
            .concat([DEFAULT_VALUE_NAME, makeCreateMessage(fieldType)])
    }, [store, fieldType])

    const valueName = useCurrentGenericInputValue(
        fieldName,
        fieldType,
        fieldValue
    )

    const handleSelect = useSelectGenericValue(fieldName, fieldType)

    const handleEdit = useCallback(() => {
        if (valueName) {
            vscode.postMessage({
                kind: "EditValue",
                typeName: fieldType,
                valueName: valueName,
                callerContextKey: contextKey,
                callerFieldName: fieldName
            } satisfies EditValueEvent)
        }
    }, [vscode, fieldType, valueName, contextKey])

    return (
        <>
            {label || <ArgLabel name={fieldName} type={fieldType} />}
            <div className={styles.genericInputRow}>
                <Select
                    value={valueName}
                    className={styles.notFullWidth}
                    options={options}
                    onChange={handleSelect}
                />
                <IconButton
                    onClick={handleEdit}
                    disabled={valueName == DEFAULT_VALUE_NAME}
                    tooltip={valueName == DEFAULT_VALUE_NAME ? `Can't edit ${DEFAULT_VALUE_NAME}` : undefined}
                >
                    <PencilIcon />
                </IconButton>
            </div>
        </>
    )
}

export function useSelectGenericValue(fieldName: string, fieldType: string) {
    const schemas = useTypeSchemas()
    const store = useStoreHelper()
    const changeValue = useChangeFieldValue()
    const createValue = useCreateValue()

    return useCallback(
        (newValueName: string) => {
            if (newValueName == makeCreateMessage(fieldType)) {
                const uniqueName = makeUniqueValueName(store.values, fieldType)

                createValue({
                    typeName: fieldType,
                    valueName: uniqueName,
                    callerFieldName: fieldName,
                    linkToCaller: true
                })
            } else {
                const schema = tryResolveSchema(schemas, fieldType)

                if (!schema) {
                    return
                }

                if (newValueName == DEFAULT_VALUE_NAME) {
                    changeValue({
                        fieldName,
                        fieldType,
                        fieldValue: makeNilValue(schema)
                    })
                } else {
                    const targetKey = `${fieldType}::${newValueName}`
                    const valueCborHex = store.getValue(targetKey, schema)

                    if (valueCborHex) {
                        changeValue({
                            fieldName,
                            fieldType,
                            fieldValue: valueCborHex,
                            link: `${fieldType}::${newValueName}`
                        })
                    }
                }
            }
        },
        [
            schemas,
            store,
            fieldName,
            fieldType,
            changeValue,
            createValue
        ]
    )
}

export function useCurrentGenericInputValue(
    fieldName: string,
    fieldType: string,
    fieldValue: string
): string {
    const contextKey = useContextKey()
    const store = useStoreHelper()
    const schemas = useTypeSchemas()
    const prefer = store.getValidLinkValueName(contextKey, fieldName)

    return useMemo(() => {
        if (!fieldValue) {
            return DEFAULT_VALUE_NAME
        }

        const schema = tryResolveSchema(schemas, fieldType)

        if (!schema) {
            return DEFAULT_VALUE_NAME
        }

        if (prefer) {
            const preferKey = `${fieldType}::${prefer}`
            if (store.getValue(preferKey, schema) == fieldValue) {
                return prefer
            }
        }

        if (makeNilValue(schema) == fieldValue) {
            return DEFAULT_VALUE_NAME
        }

        // look for value in store, if it appears, use the associated name
        const valueNames = store.findValueNames(fieldType, schema, fieldValue)

        if (valueNames.length == 0) {
            return DEFAULT_VALUE_NAME
        } else if (valueNames.length == 1) {
            return valueNames[0]
        } else if (prefer) {
            const i = valueNames.indexOf(prefer)

            if (i != -1) {
                return valueNames[i]
            } else {
                return valueNames[0]
            }
        } else {
            return valueNames[0]
        }
    }, [fieldType, fieldValue, store, prefer, schemas])
}
