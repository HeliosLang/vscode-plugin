import { build } from "esbuild"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const dir = await mkdtemp(join(tmpdir(), "helios-extension-tests-"))
try {
    for (const name of ["launchConfig", "captures", "compilation"]) {
        const outfile = join(dir, `${name}.test.cjs`)
        await build({
            entryPoints: [`test/${name}.test.ts`],
            outfile,
            bundle: true,
            mainFields: ["module", "main"],
            platform: "node",
            format: "cjs"
        })
        await import(pathToFileURL(outfile).href)
    }
} finally {
    await rm(dir, { recursive: true, force: true })
}
