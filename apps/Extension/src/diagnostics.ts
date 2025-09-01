import {
    languages,
    TextDocument,
    Diagnostic,
    DiagnosticCollection,
    Range,
    Position,
    DiagnosticSeverity,
    window
} from "vscode"

import { isHeliosExt } from "./repository"
import { Program } from "@helios-lang/compiler"
import { ASTProvider } from "./ASTProvider"

function isHeliosScript(document: TextDocument): boolean {
    return isHeliosExt(document.fileName)
}

export class DiagnosticsProvider {
    private diagnostics: DiagnosticCollection

    constructor(astProvider: ASTProvider) {
        this.diagnostics = languages.createDiagnosticCollection("helios")

        astProvider.addCompileListener((programs: Record<string, Program>) => {
            for (let openTextEditor of window.visibleTextEditors) {
                this.refresh(programs, openTextEditor.document)
            }
        })
    }

    async refresh(programs: Record<string, Program>, document: TextDocument) {
        if (!isHeliosScript(document)) {
            return
        }

        const program = programs[document.uri.toString()]

        if (!program) {
            return
        }

        const fileDiagnostics: Diagnostic[] = []

        program.errors.errors.forEach((e) => {
            // includes errors in other files, which we can't include in these diagnostics
            if (e.site.file != document.uri.toString()) {
                return
            }

            const startLine = e.site.line
            const startCol = e.site.column

            const endLine = e.site.end ? e.site.end.line : startLine
            const endCol = e.site.end ? e.site.end.column : startCol + 1

            fileDiagnostics.push(
                new Diagnostic(
                    new Range(
                        new Position(startLine, startCol),
                        new Position(endLine, endCol)
                    ),
                    e.originalMessage,
                    DiagnosticSeverity.Error
                )
            )
        })

        this.diagnostics.set(document.uri, fileDiagnostics)
    }
}
