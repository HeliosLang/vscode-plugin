import { useCallback } from "react"
import {
    CreateValueEvent,
    type ChangeEntryPointEvent,
    type ChangeFieldValueEvent,
    type ChangeValueNameEvent,
    type ClickErrorEvent
} from "schemas"
import { useVsCodeApi } from "./vscode"
import { useContextKey, usePanelContext } from "./context"

export function useChangeEntryPoint() {
    const vscode = useVsCodeApi()

    return useCallback(
        (entryPointName: string) => {
            const event: ChangeEntryPointEvent = {
                kind: "ChangeEntryPoint",
                entryPointName
            }

            vscode.postMessage(event)
        },
        [vscode]
    )
}

export function useClickError(errorUri: string) {
    const vscode = useVsCodeApi()

    return useCallback(() => {
        vscode.postMessage({
            kind: "ClickError",
            errorUri
        } satisfies ClickErrorEvent)
    }, [vscode, errorUri])
}

export function useChangeFieldValue() {
    const contextKey = useContextKey()
    const vscode = useVsCodeApi()

    return useCallback(
        (args: {
            fieldName: string
            fieldType: string
            fieldValue: string
            link?: string
        }) => {
            vscode.postMessage({
                kind: "ChangeFieldValue",
                contextKey,
                ...args
            } satisfies ChangeFieldValueEvent)
        },
        [vscode, contextKey]
    )
}

export function useChangeValueName() {
    const context = usePanelContext()
    const vscode = useVsCodeApi()

    return useCallback(
        (newName: string) => {
            if (context.kind != "ValuePanel") {
                return
            }

            vscode.postMessage({
                kind: "ChangeValueName",
                typeName: context.typeName,
                oldName: context.valueName,
                newName
            } satisfies ChangeValueNameEvent)
        },
        [context, vscode]
    )
}

export function useCreateValue() {
    const vscode = useVsCodeApi()
    const contextKey = useContextKey()

    return useCallback(
        (args: {
            typeName: string
            valueName: string
            callerFieldName: string
            linkToCaller: boolean
        }) => {
            vscode.postMessage({
                kind: "CreateValue",
                callerContextKey: contextKey,
                ...args
            } satisfies CreateValueEvent)
        },
        [vscode, contextKey]
    )
}
