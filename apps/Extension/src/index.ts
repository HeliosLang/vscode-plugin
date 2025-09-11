import {
    type ExtensionContext,
    debug,
    window,
    commands,
    workspace,
    DebugConfigurationProviderTriggerKind
} from "vscode"
import { encodeFullUplcProgram } from "@helios-lang/uplc"
//import { registerHoverProvider } from "./hover"
import { ArgsViewProvider } from "./ArgsViewProvider"
import { isHeliosExt } from "./repository"
import { bytesToHex } from "@helios-lang/codec-utils"
import { DiagnosticsProvider } from "./diagnostics"
import { ValueViewsProvider } from "./ValueViewsProvider"
import { ValuesProvider as ValuesProvider } from "./ValuesProvider"
import { ASTProvider } from "./ASTProvider"
import { TypeSchemasProvider } from "./TypeSchemasProvider"

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

    extensionContext.subscriptions.push(
        window.registerWebviewViewProvider(
            "helios.entryPointAndArguments",
            argsViewProvider
        )
    )

    extensionContext.subscriptions.push(
        debug.registerDebugConfigurationProvider("helios", {
            resolveDebugConfiguration: (_folder, config, _token) => {
                // This is called when the user hits Run and Debug for type "mylang"
                const uplcProgramAndArgs =
                    argsViewProvider.compileProgramAndArgs()

                if (!uplcProgramAndArgs) {
                    return undefined
                }

                const { uplcProgram, args } = uplcProgramAndArgs

                return {
                    name: config.name ?? "Launch Helios Debugger",
                    type: config.type ?? "heliosdebugger",
                    request: config.request ?? "launch",
                    uplcProgram: bytesToHex(encodeFullUplcProgram(uplcProgram)),
                    ...(args !== undefined
                        ? { args: args.map((a) => bytesToHex(a.toCbor())) }
                        : {})
                }
            }
        })
    )

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
                    commands.executeCommand("setContext", "heliosDebugActive", true)
                } else {
                    commands.executeCommand("setContext", "heliosDebugActive", false)
                }
            }
        })
    )

    extensionContext.subscriptions.push(
        workspace.onDidOpenTextDocument((doc) => {
            if (isHeliosExt(doc.uri.toString())) {
                astProvider.updateSource(doc)
            }
        })
    )

    extensionContext.subscriptions.push(
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

    if (isHeliosExt(window.activeTextEditor?.document.uri.toString() ?? "")) {
        commands.executeCommand("setContext", "heliosDebugActive", true)
    } else {
        commands.executeCommand("setContext", "heliosDebugActive", false)
    }

    astProvider.init()
}

export function deactivate() {
    return
}
