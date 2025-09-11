import { type ExtensionContext, window, commands, workspace } from "vscode"
import { ArgsViewProvider } from "./ArgsViewProvider"
import { isHeliosExt } from "./repository"
import { DiagnosticsProvider } from "./diagnostics"
import { ValueViewsProvider } from "./ValueViewsProvider"
import { ValuesProvider as ValuesProvider } from "./ValuesProvider"
import { ASTProvider } from "./ASTProvider"
import { TypeSchemasProvider } from "./TypeSchemasProvider"
import {
    appendMinimalLaunchConfig,
    HeliosDebugConfigurationProvider,
    removeMinimalLaunchConfig
} from "./HeliosDebugConfigurationProvider"

// called when plugin is loaded
// TODO: how to properly handle different compiler versions?
// what if no compiler is installed? (eg. a pure helios repo, or simply only opening a helios file as an auditor -> the included helios library should internally have the option to use older library versions)
export function activate(extensionContext: ExtensionContext) {
    // wire everything together
    const astProvider = new ASTProvider()

    const schemasProvider = new TypeSchemasProvider(astProvider)

    const valuesProvider = new ValuesProvider(schemasProvider)

    const valueViewCollection = new ValueViewsProvider(
        extensionContext,
        astProvider,
        schemasProvider,
        valuesProvider
    )

    const argsViewProvider = new ArgsViewProvider(
        extensionContext,
        astProvider,
        schemasProvider,
        valuesProvider,
        valueViewCollection
    )

    new DiagnosticsProvider(astProvider)

    // only load all Helios files upon activation, then update them using workspace.textDocuments upon specific events
    // Helios sources are loaded into

    // TODO: intelligent recompilation, update means something changed, we have a map of file locations to
    //const updateFiles = () => {
    //    // one AST per file, isn't the most efficient, but makes sense in the multi-validator setting
    //    // events update the set of sources
    //    // this results in an AST recompilation
    //    // for now only do validators (doesn't require Helios API change)
    //    // for modules display an "unavailable" AST message
    //    const files = workspace.textDocuments
    //        .filter((doc) => isHeliosExt(doc.fileName))
    //        .map((doc) => doc.fileName)
    //    entryPointAndArgumentsViewProvider.setFileList(files)
    //}

    /*languages.registerDocumentFormattingEditProvider('helios', {
		provideDocumentFormattingEdits: (document) => {
			const firstLine = document.lineAt(0);
			if (firstLine.text !== '42') {
			    return [vscode.TextEdit.insert(firstLine.range.start, '42\n')];
			}
	    }
	})*/

    //registerHoverProvider(cache)

    new HeliosDebugConfigurationProvider(extensionContext, argsViewProvider)

    //context.subscriptions.push(
    //    debug.onDidStartDebugSession((session) => {
    //        if (session.type === 'helios') {
    //            console.log("Started Helios debug session:", session)
    //        }
    //    })
    //)

    // is this automatically triggered?
    //if (
    //    window.activeTextEditor &&
    //    isHeliosExt(window.activeTextEditor.document.fileName)
    //) {
    //    entryPointAndArgumentsViewProvider.reveal()
    //}

    extensionContext.subscriptions.push(
        window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                if (isHeliosExt(editor.document.fileName)) {
                    astProvider.recompileOpenASTs()
                }

                syncHeliosDebuggerVisibility()
            }
        }),
        workspace.onDidOpenTextDocument((doc) => {
            if (isHeliosExt(doc.uri.toString())) {
                astProvider.updateSource(doc)
            }
        }),
        workspace.onDidChangeTextDocument((event) => {
            if (isHeliosExt(event.document.uri.toString())) {
                astProvider.updateSource(event.document)
            }
        })
    )

    // why should closing a document trigger a recompilaton?
    //context.subscriptions.push(
    //    workspace.onDidCloseTextDocument((doc) => {
    //        if (isHeliosExt(doc.uri.toString())) {
    //            loadHeliosDocuments()
    //        }
    //    })
    //)

    syncHeliosDebuggerVisibility()
    astProvider.init()
}

async function syncHeliosDebuggerVisibility() {
    if (isHeliosExt(window.activeTextEditor?.document.uri.toString() ?? "")) {
        // adding a minimal heliosdebugger launch config hides the default "Run and Debug" button
        // we have no control over the "Run and Debug" button, which leads to an inconsistent user experience between when a helios file is open, and a when a helios value is being edited via a form
        await appendMinimalLaunchConfig()

        commands.executeCommand("setContext", "heliosDebugActive", true)
    } else {
        await removeMinimalLaunchConfig()
        commands.executeCommand("setContext", "heliosDebugActive", false)
    }
}

export function deactivate() {
    return
}
