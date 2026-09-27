import { build } from "esbuild"
import { fileURLToPath } from "node:url"
await build({
    absWorkingDir: fileURLToPath(new URL(".", import.meta.url)),
    entryPoints: ["test/extension-host.test.ts"],
    outfile: "../../dist/extension-host.test.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    mainFields: ["module", "main"],
    external: ["vscode"]
})
