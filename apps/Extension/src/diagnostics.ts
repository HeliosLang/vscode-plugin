import { existsSync } from "fs"

import { dirname, extname, join as joinPath } from "path"

import {
    languages,
    window,
    workspace,
    ExtensionContext,
    TextDocument,
    Diagnostic,
    DiagnosticCollection,
    Range,
    Position,
    DiagnosticSeverity
} from "vscode"

import { isHeliosExt } from "./repository"

import { Cache } from "./cache"
import { Program } from "@helios-lang/compiler"

// task queue first-in-last-out
let tasks: [string, () => Promise<void>][] = []

// only handle one task
function handleTasks() {
    const task = tasks.pop()

    if (task) {
        tasks = tasks.filter((t) => t[0] !== task[0])

        task[1]().then(() => {
            setTimeout(handleTasks, 500)
        })
    } else {
        setTimeout(handleTasks, 500)
    }
}

handleTasks()

function isHeliosScript(document: TextDocument): boolean {
    return isHeliosExt(document.fileName)
}

async function refreshDiagnostics(
    programs: Record<string, Program>,
    document: TextDocument,
    heliosDiagnostics: DiagnosticCollection
) {
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

    heliosDiagnostics.set(document.uri, fileDiagnostics)
}

// this is actually just a trigger/entrypoint
export function registerDiagnostics(
    context: ExtensionContext,
    programs: Record<string, Program>
) {
    const heliosDiagnostics = languages.createDiagnosticCollection("helios")

    if (window.activeTextEditor) {
        refreshDiagnostics(
            programs,
            window.activeTextEditor.document,
            heliosDiagnostics
        )
    }

    context.subscriptions.push(
        window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                refreshDiagnostics(programs, editor.document, heliosDiagnostics)
            }
        })
    )

    context.subscriptions.push(
        workspace.onDidChangeTextDocument((e) =>
            refreshDiagnostics(programs, e.document, heliosDiagnostics)
        )
    )

    return () => {
        for (let openTextEditor of window.visibleTextEditors) {
            refreshDiagnostics(
                programs,
                openTextEditor.document,
                heliosDiagnostics
            )
        }
    }
}
