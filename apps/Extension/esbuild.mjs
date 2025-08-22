import { build } from "esbuild"
import { dirname, join } from "node:path"

async function main() {
    const appRoot = join(dirname(process.argv[1]), "./")
    const repoRoot = join(appRoot, "..", "..")

    const srcBaseDir = join(appRoot, "src")
    const dstBaseDir = join(repoRoot, "dist")

    await build({
        bundle: true,
        splitting: false,
        format: "cjs",
        platform: "node",
        external: ["vscode", "node:*"],
        minify: true,
        outfile: join(dstBaseDir, "extension.js"),
        entryPoints: [join(srcBaseDir, "index.ts")],
        tsconfig: join(appRoot, "tsconfig.json")
    })
}

main()
