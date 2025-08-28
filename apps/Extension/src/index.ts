import {
    type ExtensionContext,
    debug,
    window,
    commands,
    workspace,
    type TextDocument
} from "vscode"
import { Program } from "@helios-lang/compiler"
import { type TypeSchema } from "@helios-lang/type-utils"
//import { registerHoverProvider } from "./hover"
import { ArgsViewProvider } from "./ArgsViewProvider"
import { isHeliosExt } from "./repository"
import { bytesToHex } from "@helios-lang/codec-utils"
import { DiagnosticsProvider } from "./diagnostics"
import { ValueViewsProvider } from "./ValueViewsProvider"
import { ValuesProvider as ValuesProvider } from "./ValuesProvider"
import { type Store } from "schemas"
import { ASTProvider } from "./ASTProvider"
import { TypeSchemasProvider } from "./TypeSchemasProvider"

// called when plugin is loaded
// TODO: how to properly handle different compiler versions?
// what if no compiler is installed? (eg. a pure helios repo, or simply only opening a helios file as an auditor -> the included helios library should internally have the option to use older library versions)
export function activate(extensionContext: ExtensionContext) {
    // wire everything together
    const schemasProvider = new TypeSchemasProvider()

    const valuesProvider = new ValuesProvider(schemasProvider)

    const valueViewCollection = new ValueViewsProvider(
        extensionContext,
        schemasProvider,
        valuesProvider
    )

    const argsViewProvider = new ArgsViewProvider(
        extensionContext,
        schemasProvider,
        valuesProvider,
        valueViewCollection
    )

    const diagnostics = new DiagnosticsProvider()

    const astProvider = new ASTProvider((programs: Record<string, Program>) => {
        for (let openTextEditor of window.visibleTextEditors) {
            diagnostics.refresh(programs, openTextEditor.document)
        }

        if (!window.activeTextEditor) {
            return
        }

        const key = window.activeTextEditor.document.uri.toString()

        if (isHeliosExt(key)) {
            const p = programs[key]

            if (p) {
                argsViewProvider.setAST(p)
            } else {
                argsViewProvider.setAST(undefined)
            }
        }

        schemasProvider.setSchemas(collectTypeSchemas(programs))
    })

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
            argsViewProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
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

                // TODO: also send UPLC cborHex, source code mapping, arguments (CBOR hex), and ScriptContext (CBOR hex) to debug process
                // entryPoint isn't used during the run, but still provides useful information during debugging
                return {
                    name: config.name ?? "Launch Helios Debugger",
                    type: config.type ?? "helios",
                    request: config.request ?? "launch",
                    uplcProgram: bytesToHex(uplcProgram.toCbor()),
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

    //context.subscriptions.push(
    //    commands.registerCommand("helios.showEntryPointAndArguments", () =>
    //        entryPointAndArgumentsViewProvider.reveal()
    //    )
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
            if (editor && isHeliosExt(editor.document.fileName)) {
                astProvider.recompileOpenASTs()
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

    commands.executeCommand("setContext", "heliosDebugActive", true)
    astProvider.init()
}

export function deactivate() {
    return
}

function collectTypeSchemas(
    programs: Record<string, Program>
): Record<string, TypeSchema> {
    const result: Record<string, TypeSchema> = {}

    for (let programKey in programs) {
        const p = programs[programKey]

        const types = p.userTypes

        for (let moduleName in types) {
            const moduleTypes = types[moduleName]

            // just keep the inner name

            for (let typeName in moduleTypes) {
                result[typeName] = moduleTypes[typeName].toSchema()
            }
        }
    }

    return result
}
