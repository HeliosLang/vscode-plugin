import { TextDocument, window, workspace } from "vscode"
import {
    makeHeliosSource,
    makeSource,
    type Source
} from "@helios-lang/compiler-utils"
import { getScriptHashType, Program, ProgramProps } from "@helios-lang/compiler"
import { isHeliosExt } from "./repository"

export class ASTProvider {
    private initialized: boolean
    private sources: Record<string, Source>
    private programs: Record<string, Program>
    private onCompile: (programs: Record<string, Program>) => void // collect all TypeSchemas?

    constructor(onCompile: (programs: Record<string, Program>) => void) {
        this.initialized = false
        this.sources = {}
        this.programs = {}
        this.onCompile = onCompile
    }

    updateSource(doc: TextDocument) {
        this.setSource(doc)
        this.recompileOpenASTs()
    }

    init(): void {
        if (this.initialized) {
            this.loadKnownDocs()
            return
        }

        workspace
            .findFiles("**/*.hl", "**/node_modules/**")
            .then((uris) =>
                Promise.all(uris.map((uri) => workspace.openTextDocument(uri)))
            )
            .then((docs) => {
                docs.forEach((d) => this.setSource(d))
            })
            .then(() => {
                this.initialized = true
                this.loadKnownDocs()
                this.recompileOpenASTs()
            })
    }

    private loadKnownDocs() {
        workspace.textDocuments.forEach((d) => this.setSource(d))
    }

    recompileOpenASTs() {
        const todo: TextDocument[] = []

        if (
            window.activeTextEditor &&
            isHeliosDoc(window.activeTextEditor.document)
        ) {
            todo.push(window.activeTextEditor.document)
        }

        todo.forEach((d) => {
            const key = d.uri.toString()

            const s = this.sources[key]

            try {
                this.programs[key] = this.compileProgram(s)
            } catch (e) {
                console.error(
                    "failed to compile program: " +
                        (e as Error).message +
                        "| sources: " +
                        Object.keys(this.sources).join(", ")
                )
            }
        })

        this.onCompile(this.programs)
    }

    private compileProgram(s: Source): Program {
        return new Program(s, {
            moduleSources: Object.values(this.sources).filter(
                (ms) => ms.purpose == "module" && ms.name != s.name
            ),
            validatorTypes: Object.fromEntries(
                Object.values(this.sources)
                    .filter(
                        (s) =>
                            s.purpose != undefined &&
                            s.moduleName != undefined &&
                            s.purpose != "module" &&
                            !s.purpose?.startsWith("test")
                    )
                    .map((s) => {
                        return [
                            s.moduleName as string,
                            getScriptHashType(s.purpose as string)
                        ]
                    })
            ),
            throwCompilerErrors: false,
            allowModuleEntryPoint: true
        })
    }

    private setSource(doc: TextDocument) {
        if (!isHeliosDoc(doc)) {
            return
        }

        const key = doc.uri.toString()
        const name = key

        const content = doc.getText()

        // first try making a regular Helios Source
        // if that fails make a generic Source

        let source: Source

        try {
            source = makeHeliosSource(content, {
                name
            })
        } catch (e) {
            source = makeSource(content, {
                name
            })
        }

        this.sources[key] = source
    }
}

function isHeliosDoc(doc: TextDocument) {
    return isHeliosExt(doc.uri.toString())
}
