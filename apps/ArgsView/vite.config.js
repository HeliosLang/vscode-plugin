import { dirname, join } from "node:path"
import { defineConfig } from "vite"
import viteReact from "@vitejs/plugin-react"
import { viteSingleFile } from "vite-plugin-singlefile"

// process.argv[1] is the vite binary
const appRoot = dirname(__filename)
const repoRoot = join(appRoot, "..", "..")
const srcDir = join(appRoot, "src")
const dstDir = join(repoRoot, "dist", "ArgsView")

export default defineConfig({
    root: srcDir,
    build: {
        outDir: dstDir,
        minify: false
    },
    plugins: [viteReact(), viteSingleFile()]
})
