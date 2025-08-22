import { useMemo } from "react"

let vscode_: VSCodeAPI | undefined = undefined

export function useVsCodeApi(): VSCodeAPI {
    // only run this once ever
    return useMemo(() => {
        if (!vscode_) {
            vscode_ = acquireVsCodeApi()
        }

        return vscode_
    }, [])
}
