import {
	ExtensionContext
} from "vscode"

import {
	Cache
} from "./cache"

import {
	registerDiagnostics
} from "./diagnostics"

import {
	registerHoverProvider
} from "./hover"

// called when plugin is loaded
export function activate(context: ExtensionContext) {
	const cache = new Cache()

	/*languages.registerDocumentFormattingEditProvider('helios', {
		provideDocumentFormattingEdits: (document) => {
			const firstLine = document.lineAt(0);
			if (firstLine.text !== '42') {
			    return [vscode.TextEdit.insert(firstLine.range.start, '42\n')];
			}
	    }
	})*/

	registerDiagnostics(context, cache)

	registerHoverProvider(cache)
}

export function deactivate() {
	return
}