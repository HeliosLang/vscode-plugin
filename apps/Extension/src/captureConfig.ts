import { homedir } from "node:os"
import { dirname, posix, win32 } from "node:path"
import { lstat, readFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

export type CaptureProfile = {
    id: string
    name: string
    apiKey: string
    endpoint: string
}
export function configPath(
    platform = process.platform,
    env = process.env,
    home = homedir()
): string {
    const path = platform === "win32" ? win32 : posix
    return path.join(
        env.HELIOS_CONFIG_HOME ||
            (platform === "win32"
                ? path.join(
                      env.APPDATA || path.join(home, "AppData", "Roaming"),
                      "Helios"
                  )
                : platform === "darwin"
                  ? path.join(home, "Library", "Application Support", "Helios")
                  : path.join(
                        env.XDG_CONFIG_HOME || path.join(home, ".config"),
                        "helios"
                    )),
        "debugger.json"
    )
}
async function inspect(path: string, directory: boolean): Promise<boolean> {
    try {
        const stat = await lstat(path)
        if (
            stat.isSymbolicLink() ||
            !(directory ? stat.isDirectory() : stat.isFile())
        )
            throw new Error("Unsafe Helios configuration path")
        if (
            process.platform !== "win32" &&
            (stat.mode & 0o077 || stat.uid !== process.getuid?.())
        )
            throw new Error(
                "Helios configuration must be owned by and accessible only to the current user"
            )
        if (process.platform === "win32") {
            const script = `$ErrorActionPreference = 'Stop'\n$acl = Get-Acl -LiteralPath $env:HELIOS_CONFIG_ACL_PATH\n$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User\nif ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'Configuration must be owned by the current user' }\nforeach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) { if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -ne $sid.Value) { throw 'Configuration must be accessible only by the current user' } }`
            await promisify(execFile)(
                "powershell.exe",
                [
                    "-NoProfile",
                    "-NonInteractive",
                    "-EncodedCommand",
                    Buffer.from(script, "utf16le").toString("base64")
                ],
                {
                    windowsHide: true,
                    env: { ...process.env, HELIOS_CONFIG_ACL_PATH: path }
                }
            )
        }
        return true
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
        throw error
    }
}
export async function readCaptureProfiles(
    path = configPath()
): Promise<CaptureProfile[]> {
    await inspect(dirname(path), true)
    if (!(await inspect(path, false))) return []
    let config: any
    try {
        config = JSON.parse(await readFile(path, "utf8"))
    } catch {
        throw new Error(
            "Cannot read Helios configuration. Run helios login again."
        )
    }
    if (
        config.version !== 1 ||
        !config.profiles ||
        typeof config.profiles !== "object" ||
        Array.isArray(config.profiles)
    )
        throw new Error("Invalid Helios configuration. Run helios login again.")
    return Object.entries(config.profiles).map(([id, entry]) => {
        const p = entry as CaptureProfile
        if (
            !p ||
            typeof p.name !== "string" ||
            !/^hdbg_[a-f0-9]{64}$/.test(p.apiKey) ||
            typeof p.endpoint !== "string"
        )
            throw new Error(
                "Invalid Helios project configuration. Run helios login again."
            )
        const url = new URL(p.endpoint)
        if (
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            (url.protocol !== "https:" &&
                !(
                    url.protocol === "http:" &&
                    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
                ))
        )
            throw new Error("Invalid debugger service endpoint")
        return {
            id: p.id || id,
            name: p.name,
            apiKey: p.apiKey,
            endpoint: url.origin
        }
    })
}
