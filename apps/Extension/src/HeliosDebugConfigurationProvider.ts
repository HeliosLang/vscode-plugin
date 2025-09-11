import {
    CancellationToken,
    debug,
    DebugConfiguration,
    ExtensionContext,
    Uri,
    workspace,
    WorkspaceFolder,
    type DebugConfigurationProvider
} from "vscode"
import { ArgsViewProvider } from "./ArgsViewProvider"
import { bytesToHex } from "@helios-lang/codec-utils"
import { encodeFullUplcProgram } from "@helios-lang/uplc"
import { applyEdits, modify, parse } from "jsonc-parser"

export class HeliosDebugConfigurationProvider
    implements DebugConfigurationProvider
{
    private readonly argsViewProvider: ArgsViewProvider

    constructor(
        extensionContext: ExtensionContext,
        argsViewProvider: ArgsViewProvider
    ) {
        this.argsViewProvider = argsViewProvider

        extensionContext.subscriptions.push(
            debug.registerDebugConfigurationProvider("helios", this),
            debug.registerDebugConfigurationProvider("heliosdebugger", this)
        )
    }

    resolveDebugConfiguration(
        _folder: WorkspaceFolder | undefined,
        config: DebugConfiguration,
        _token: CancellationToken | undefined
    ) {
        // This is called when the user hits Run and Debug for type "mylang"
        const uplcProgramAndArgs = this.argsViewProvider.compileProgramAndArgs()

        if (!uplcProgramAndArgs) {
            return undefined
        }

        const { uplcProgram, args } = uplcProgramAndArgs

        return {
            name: config.name ?? "Launch Helios Debugger",
            type: config.type ?? "heliosdebugger",
            request: config.request ?? "launch",
            uplcProgram: bytesToHex(encodeFullUplcProgram(uplcProgram)),
            ...(args !== undefined
                ? { args: args.map((a) => bytesToHex(a.toCbor())) }
                : {})
        }
    }
}

export async function appendMinimalLaunchConfig() {
    const type = "heliosdebugger"
    const request = "launch"
    const name = "Helios: Run Current"

    // 1) Choose a workspace folder
    const folder = workspace.workspaceFolders?.[0]
    if (!folder) {
        return
    }

    // 2) Ensure .vscode/ exists
    const vscodeDir = Uri.joinPath(folder.uri, ".vscode")
    try {
        await workspace.fs.stat(vscodeDir)
    } catch {
        await workspace.fs.createDirectory(vscodeDir)
    }

    // 3) Path to launch.json
    const launchUri = Uri.joinPath(vscodeDir, "launch.json")

    // Desired minimal configuration
    const minimalConfig = { type, request, name }

    const enc = new TextEncoder()
    const dec = new TextDecoder("utf-8")

    // 4) If file doesn't exist → create minimal launch.json
    try {
        await workspace.fs.stat(launchUri)
    } catch {
        const content =
            JSON.stringify(
                { version: "0.2.0", configurations: [minimalConfig] },
                null,
                2
            ) + "\n"

        await workspace.fs.writeFile(launchUri, enc.encode(content))
        return
    }

    // 5) File exists → read, parse (JSONC), and append or set configs
    const fmt = { insertSpaces: true, tabSize: 2, eol: "\n" as const }
    const raw = dec.decode(await workspace.fs.readFile(launchUri))
    let data: any
    try {
        // tolerates comments and trailing comments
        data = parse(raw)
    } catch {
        // launch.json is not valid JSON/JSONC
        return
    }

    const configs = Array.isArray(data?.configurations)
        ? data.configurations
        : null

    // If there's already an identical entry, we're done
    if (
        configs?.some(
            (c: any) =>
                c?.type === type && c?.request === request && c?.name === name
        )
    ) {
        return
    }

    let updated = raw

    updated = applyEdits(
        updated,
        modify(updated, ["configurations"], [minimalConfig], {
            formattingOptions: fmt
        })
    )

    // Ensure version exists (don’t overwrite if user has one)
    if (data?.version == null) {
        updated = applyEdits(
            updated,
            modify(updated, ["version"], "0.2.0", { formattingOptions: fmt })
        )
    }

    if (updated !== raw) {
        await workspace.fs.writeFile(launchUri, enc.encode(updated))
    }
}

export async function removeMinimalLaunchConfig() {
    const type = "heliosdebugger"
    const request = "launch"
    const name = "Helios: Run Current"

    // 1) Choose a workspace folder
    const folder = workspace.workspaceFolders?.[0]
    if (!folder) {
        return
    }

    // 2) if .vscode/ doesn't exists -> return immediately
    const vscodeDir = Uri.joinPath(folder.uri, ".vscode")
    try {
        await workspace.fs.stat(vscodeDir)
    } catch {
        return
    }

    // 3) Path to launch.json
    const launchUri = Uri.joinPath(vscodeDir, "launch.json")

    const enc = new TextEncoder()
    const dec = new TextDecoder("utf-8")

    // 4) If file doesn't exist → return immediately
    try {
        await workspace.fs.stat(launchUri)
    } catch {
        return
    }

    // 5) File exists → read, parse (JSONC), and append or set configs
    const fmt = { insertSpaces: true, tabSize: 2, eol: "\n" as const }
    const raw = dec.decode(await workspace.fs.readFile(launchUri))
    let data: any
    try {
        // tolerates comments and trailing comments
        data = parse(raw)
    } catch {
        // launch.json is not valid JSON/JSONC
        return
    }

    const configs: any[] | null = Array.isArray(data?.configurations)
        ? data.configurations
        : null

    // If there isn't such a configuration -> return immediately
    const i = configs?.findIndex(
        (c: any) =>
            c && c.type === type && c.request === request && c.name === name
    )
    if (i === undefined || i == -1) {
        return
    }

    let updated = raw
    updated = applyEdits(
        updated,
        modify(updated, ["configurations", i], undefined, {
            formattingOptions: fmt
        })
    )

    if (updated !== raw) {
        await workspace.fs.writeFile(launchUri, enc.encode(updated))
    }
}
