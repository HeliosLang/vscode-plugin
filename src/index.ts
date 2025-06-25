import {
        ExtensionContext,
        window,
        commands
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

import { RunViewProvider } from "./runView"
import { isHeliosExt } from "./repository"

// called when plugin is loaded
export function activate(context: ExtensionContext) {
        const cache = new Cache()
        const runViewProvider = new RunViewProvider(context, cache)

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

        context.subscriptions.push(
                window.registerWebviewViewProvider(RunViewProvider.viewType, runViewProvider)
        )

        context.subscriptions.push(
                commands.registerCommand("helios.showRunView", () => runViewProvider.reveal())
        )

        if (window.activeTextEditor && isHeliosExt(window.activeTextEditor.document.fileName)) {
                runViewProvider.reveal()
        }

        context.subscriptions.push(
                window.onDidChangeActiveTextEditor(editor => {
                        if (editor && isHeliosExt(editor.document.fileName)) {
                                const lib = cache.loadCachedLibrary(editor.document.fileName)
                                if (lib) {
                                        const maybe = lib.extractScriptPurposeAndName(editor.document.getText())
                                        if (maybe) {
                                                runViewProvider.setValidatorName(maybe[1])
                                        }
                                }
                                runViewProvider.reveal()
                        }
                })
        )
}

export function deactivate() {
	return
}