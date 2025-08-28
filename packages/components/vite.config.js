import { dirname, join } from "node:path"
import { defineConfig } from "vite"
import dts from "vite-plugin-dts"

// process.argv[1] is the vite binary
const appRoot = dirname(__filename)

console.log(appRoot)
const srcDir = join(appRoot, "src")
const dstDir = join(appRoot, "dist")

export default defineConfig({
    root: srcDir,
    build: {
        outDir: dstDir,
        minify: false,
        lib: {
            entry: join(srcDir, "index.ts"),
            fileName: "index",
            formats: ["es"]
        },
        rollupOptions: {
            external: [
                "@helios-lang/type-utils",
                "effect",
                "schemas",
                "react",
                "react-dom",
                "@helios-lang/compiler-utils",
                "@helios-lang/codec-utils"
            ],
            output: {
                globals: {
                    react: "React",
                    "react-dom": "ReactDOM"
                },
                preserveModules: true,
                preserveModulesRoot: srcDir
            }
        },
        sourcemap: true
    },
    plugins: [
        dts({
            entryRoot: srcDir,
            outDir: dstDir
            // If you re-export types from deps, you might want:
            // skipDiagnostics: false,
            // rollupTypes: true,
        })
    ]
})
