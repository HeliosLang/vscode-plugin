import { build } from "esbuild"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const dir = await mkdtemp(join(tmpdir(), "helios-debug-tests-"))
try {
    const outfile = join(dir, "debugger.test.cjs")
    const adapter = join(dir, "adapter.cjs")
    await build({
        entryPoints: ["src/index.ts"],
        outfile: adapter,
        bundle: true,
        platform: "node",
        format: "cjs"
    })
    await build({
        entryPoints: ["test/debugger.test.ts"],
        outfile,
        bundle: true,
        platform: "node",
        format: "cjs"
    })
    const result = spawnSync(process.execPath, [outfile], {
        stdio: "inherit",
        env: { ...process.env, HELIOS_TEST_ADAPTER: adapter }
    })
    process.exitCode = result.status ?? 1
} finally {
    await rm(dir, { recursive: true, force: true })
}
