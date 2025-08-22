import { useCallback } from "react"
import {
    type ChangeArgValueEvent,
    type GoToErrorEvent,
    type SelectEntryPointEvent
} from "schemas"
import { useVsCodeApi } from "./useVsCodeApi"

export function useSelectEntryPoint(): (name: string) => void {
    const vscode = useVsCodeApi()

    return useCallback(
        (name: string) => {
            const event: SelectEntryPointEvent = {
                kind: "SelectEntryPointEvent",
                name
            }

            vscode.postMessage(event)
        },
        [vscode]
    )
}

export function useGoToError(uri: string): () => void {
    const vscode = useVsCodeApi()

    return useCallback(() => {
        const event: GoToErrorEvent = {
            kind: "GoToErrorEvent",
            uri
        }

        vscode.postMessage(event)
    }, [uri, vscode])
}

export function useChangeArgValue(): (
    name: string,
    type: string,
    cborHex?: string | undefined
) => void {
    const vscode = useVsCodeApi()

    return useCallback(
        (
            name: string,
            type: string,
            cborHex: string | undefined = undefined
        ) => {
            const event: ChangeArgValueEvent = {
                kind: "ChangeArgValueEvent",
                name,
                type,
                value: cborHex
            }

            vscode.postMessage(event)
        },
        [vscode]
    )
}
