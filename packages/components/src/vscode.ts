let vscode_: VSCodeAPI | undefined = undefined

export function useVsCodeApi(): VSCodeAPI {
    if (!vscode_) {
        vscode_ = acquireVsCodeApi()
    }

    return vscode_
}
