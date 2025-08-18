import { build } from "esbuild"
import { rmSync } from "node:fs"
import { dirname, join } from "node:path"

async function main() {
    const repoRoot = join(dirname(process.argv[1]), "./")

    const srcBaseDir = join(repoRoot, "src")
    const dstBaseDir = join(repoRoot, "dist")

    // before starting clear the directory
    rmSync(dstBaseDir, { recursive: true, force: true })

    await build({
        bundle: true,
        splitting: false,
        format: "cjs",
        platform: "node",
        external: ["vscode", "node:*"],
        minify: false,
        outfile: join(dstBaseDir, "index.js"),
        entryPoints: [join(srcBaseDir, "index.ts")],
        tsconfig: join(repoRoot, "tsconfig.json")
    })  

    await build({
        bundle: true,
        splitting: false,
        format: "cjs",
        platform: "node",
        external: ["vscode", "node:*", "@vscode/*"],
        minify: false,
        outfile: join(dstBaseDir, "debugAdapter.js"),
        entryPoints: [join(srcBaseDir, "debugAdapter.ts")],
        tsconfig: join(repoRoot, "tsconfig.json")
    })  
}

main()

