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
	isHeliosExt
} from "./repository"

import {
    Cache
} from "./cache"

// task queue first-in-last-out
let tasks: [string, () => Promise<void>][] = []

// only handle one task
function handleTasks() {
	const task = tasks.pop()

	if (task) {
		tasks = tasks.filter(t => t[0] !== task[0])

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

async function refreshDiagnostics(cache: Cache, document: TextDocument, heliosDiagnostics: DiagnosticCollection) {
	if (!isHeliosScript(document)) {
		return
	}
	
    const helios = cache.loadCachedLibrary(document.fileName)
	const repo = cache.loadCachedRepository(document.fileName)

	console.log("lib " + helios)

    if (helios && repo) {
		await repo.init(helios)

		repo.updateFile(helios, document.fileName, document.getText())

		tasks.push([repo.path, async () => {
			await repo.diagnose(helios, heliosDiagnostics)
		}])

		/*const { buildScript, Source, Tokenizer } = lib

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

		console.log("setting diagnostics for " + document.uri)

		heliosDiagnostics.set(document.uri, fileDiagnostics)*/
    }
}

// this is actually just a trigger/entrypoint
export function registerDiagnostics(context: ExtensionContext, cache: Cache) {
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
}