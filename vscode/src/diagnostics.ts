import {
    existsSync
} from "fs"

import {
	dirname,
	extname,
    join as joinPath
} from "path"

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

import {
    HeliosLibraryCache
} from "./cache"

function isHeliosScript(document: TextDocument): boolean {
	const ext = extname(document.fileName)

	return ext == ".hl" || ext == ".helios"
}

async function refreshDiagnostics(cache: HeliosLibraryCache, document: TextDocument, heliosDiagnostics: DiagnosticCollection) {
	if (!isHeliosScript(document)) {
		return
	}
	
    const lib = cache.loadCachedLibrary(document.fileName)

    if (lib) {
		const { buildScript, Source, Tokenizer } = lib

		lib.setImportPathTranslator((str: any) => {
			const relPath = str.value;

			const path = joinPath(dirname(document.fileName), relPath)

			if (!existsSync(path)) {
				str.syntaxError("file not found");
				return null;
			} else if (path == document.fileName) {
				str.syntaxError("can't import self");
				return null;
			} else {
				// TODO: return name of module
				return "_";
			}
		})
		
		const src = new Source(document.getText())

		const ts = (new Tokenizer(src)).tokenize()

		if (src.errors.length == 0) {
			buildScript(ts);
		}

		const fileDiagnostics: Diagnostic[] = []

		src.errors.forEach((e: any) => {
			const [startLine, startCol, endLine, endCol] = e.getFilePos()

			fileDiagnostics.push(
				new Diagnostic(
					new Range(
						new Position(startLine, startCol),
						new Position(endLine, endCol)
					),
					e.message.split(":").slice(1).join("").trim(),
					DiagnosticSeverity.Error
				)
			)
		})

		heliosDiagnostics.set(document.uri, fileDiagnostics)
    }
}

export function registerDiagnostics(context: ExtensionContext, cache: HeliosLibraryCache) {
	const heliosDiagnostics = languages.createDiagnosticCollection("helios")

	if (window.activeTextEditor) {
		refreshDiagnostics(cache, window.activeTextEditor.document, heliosDiagnostics);
	}

	context.subscriptions.push(
		window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				refreshDiagnostics(cache, editor.document, heliosDiagnostics);
			}
		})
	)

	context.subscriptions.push(
		workspace.onDidChangeTextDocument(e => refreshDiagnostics(cache, e.document, heliosDiagnostics))
	)

	context.subscriptions.push(
		workspace.onDidCloseTextDocument(doc => heliosDiagnostics.delete(doc.uri))
	)
}