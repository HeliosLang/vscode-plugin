import { debug } from "vscode"

export function log(msg: string) {
    return debug.activeDebugConsole.appendLine(msg)
}