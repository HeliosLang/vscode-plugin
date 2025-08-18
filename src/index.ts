import {
    ExtensionContext,
    debug,
    window,
    commands,
    workspace,
    type TextDocument
} from "vscode"
import { basename } from "node:path"
import { getScriptHashType, Program } from "@helios-lang/compiler"
import { makeHeliosSource, type Source } from "@helios-lang/compiler-utils"
//import { Cache } from "./cache"
//import { registerDiagnostics } from "./diagnostics"
//import { registerHoverProvider } from "./hover"
import { EntryPointAndArgumentsViewProvider } from "./views"
import { isHeliosExt } from "./repository"
//import { log } from "./log"

// called when plugin is loaded
// TODO: how to properly handle different compiler versions?
// what if no compiler is installed? (eg. a pure helios repo, or simply only opening a helios file as an auditor -> the included helios library should internally have the option to use older library versions)
export function activate(context: ExtensionContext) {
    //const cache = new Cache()
    let initialized = false

    const entryPointAndArgumentsViewProvider =
        new EntryPointAndArgumentsViewProvider()

    // keep the set of Helios sources up-to-date
    // upon change: sources open in the editor result in recompilation if there is any change
    const sources: Record<string, Source> = {}
    const programs: Record<string, Program> = {}

    const setASTs = () => {
        if (
            window.activeTextEditor &&
            isHeliosExt(window.activeTextEditor.document.fileName)
        ) {
            const p = programs[window.activeTextEditor.document.uri.toString()]

            if (p) {
                entryPointAndArgumentsViewProvider.setAST(
                    window.activeTextEditor.document.fileName,
                    p
                )
            } else {
                entryPointAndArgumentsViewProvider.log(
                    `${window.activeTextEditor.document.uri.toString()} not found in programs`
                )
            }
        } else {
            entryPointAndArgumentsViewProvider.log(
                "no window active or not helios file"
            )
        }

        window.visibleTextEditors.forEach((_editor) => {
            // TODO
        })
    }

    const recompileOpenASTs = () => {
        // recompile open textDocuments
        // a program is the root AST object
        const todo: TextDocument[] = []
        if (
            window.activeTextEditor &&
            isHeliosExt(window.activeTextEditor.document.fileName)
        ) {
            todo.push(window.activeTextEditor.document)
        }

        todo.forEach((d) => {
            const key = d.uri.toString()
            entryPointAndArgumentsViewProvider.log("compiling " + key)

            const s = sources[key]

            if (!s) {
                entryPointAndArgumentsViewProvider.log(
                    key + "not available in sources "
                )
                return
            }

            // TODO: also handle module purposes
            if (s.purpose == "module") {
                entryPointAndArgumentsViewProvider.log(key + " is a module")
                return
            }

            // TODO: change this to use the makeProgram function
            // TODO: what about cross referencing other scripts?
            try {
                const p = new Program(s, {
                    moduleSources: Object.values(sources).filter(
                        (s) => s.purpose == "module"
                    ),
                    validatorTypes: Object.fromEntries(
                        Object.values(sources)
                            .filter(
                                (s) =>
                                    s.purpose != undefined &&
                                    s.moduleName != undefined &&
                                    s.purpose != "module" &&
                                    !s.purpose?.startsWith("tests")
                            )
                            .map((s) => {
                                return [
                                    s.moduleName as string,
                                    getScriptHashType(s.purpose as string)
                                ]
                            })
                    ),
                    throwCompilerErrors: false
                })

                entryPointAndArgumentsViewProvider.log("compiled " + key)
                programs[key] = p
            } catch (e) {
                entryPointAndArgumentsViewProvider.log(
                    "failed to compile program: " +
                        (e as Error).message +
                        "| sources: " +
                        Object.keys(sources).join(", ")
                )

                //console.log("failed to compile program: ", e)
            }
        })

        entryPointAndArgumentsViewProvider.log("setting asts")

        setASTs()
    }

    const setHeliosDocument = (d: TextDocument) => {
        const key = d.uri.toString()

        const content = d.getText()

        try {
            const source = makeHeliosSource(content, {
                name: d.fileName
            })

            sources[key] = source
        } catch (e) {
            console.log(
                `failed to get helios source of ${d.fileName}: ${(e as Error).message} (${content.split("\n").slice(0, 5).join("\n")})`
            )
        }
    }

    const updateHeliosDocument = (d: TextDocument) => {
        setHeliosDocument(d)
        return recompileOpenASTs()
    }

    const loadHeliosDocuments = () => {
        const loadOpenHeliosDocuments = () => {
            workspace.textDocuments.forEach(setHeliosDocument)
        }

        if (!initialized) {
            return workspace
                .findFiles("**/*.hl", "**/node_modules/**")
                .then((uris) => {
                    //entryPointAndArgumentsViewProvider.log(`found ${uris.length} uris: ` + uris.map(u => u.toString()).join(", ") + " in " + (workspace.workspaceFolders ?? []).map(f => f.uri.toString()).join(","));

                    return Promise.all(
                        uris.map((uri) => workspace.openTextDocument(uri))
                    ).then((docs) => {
                        docs.forEach(setHeliosDocument)
                    })
                })
                .then(() => {
                    initialized = true
                    loadOpenHeliosDocuments()
                    return recompileOpenASTs()
                })
        } else {
            loadOpenHeliosDocuments()
        }
    }

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

    //registerDiagnostics(context, cache)

    //registerHoverProvider(cache)

    context.subscriptions.push(
        window.registerWebviewViewProvider(
            "helios.entryPointAndArguments",
            entryPointAndArgumentsViewProvider,
            {
                webviewOptions: { 
                    retainContextWhenHidden: true,
                }
            }
        )
        )

    commands.executeCommand("setContext", "heliosDebugActive", true)

    context.subscriptions.push(
        debug.registerDebugConfigurationProvider("helios", {
            resolveDebugConfiguration: (folder, config, token) => {
                // This is called when the user hits Run and Debug for type "mylang"
                console.log(
                    "Debugging helios function in resolveDebugConfiguration!",
                    config
                )

                // TODO: also send UPLC cborHex, source code mapping, arguments (CBOR hex), and ScriptContext (CBOR hex) to debug process
                // entryPoint isn't used during the run, but still provides useful information during debugging

                return { 
                    name: config.name ?? "Launch Helios Debugger",
                    type: config.type ?? "helios",
                    request: config.request ?? "launch",
                    entryPoint: entryPointAndArgumentsViewProvider.entryPoint,

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

    loadHeliosDocuments()
    //updateFiles()

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

    context.subscriptions.push(
        window.onDidChangeActiveTextEditor((editor) => {
            if (editor && isHeliosExt(editor.document.fileName)) {
                recompileOpenASTs()
            }
        })
    )

    context.subscriptions.push(
        workspace.onDidOpenTextDocument((doc) => {
            if (isHeliosExt(doc.fileName)) {
                updateHeliosDocument(doc)
            }
        })
    )

    context.subscriptions.push(
        workspace.onDidChangeTextDocument((event) => {
            if (isHeliosExt(event.document.fileName)) {
                updateHeliosDocument(event.document)
            }
        })
    )

    // why should closing a document trigger a recompilaton?
    //context.subscriptions.push(
    //    workspace.onDidCloseTextDocument((doc) => {
    //        if (isHeliosExt(doc.fileName)) {
    //            loadHeliosDocuments()
    //        }
    //    })
    //)
}

export function deactivate() {
    return
}

function convertTextDocumentToSource(d: TextDocument) {
    return {}
}
