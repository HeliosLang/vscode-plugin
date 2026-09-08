import { Schema } from "effect"
import {
    TypeSchemasContext,
    PanelEvent,
    ClickErrorEvent,
    ChangeEntryPointEvent,
    ValueStoreContext,
    ArgsPanelContext,
    PanelLoadingContext,
    makeDefaultValue,
    resolveSchema
} from "schemas"
import {
    type ExtensionContext,
    WebviewViewProvider,
    WebviewView,
    WebviewViewResolveContext,
    CancellationToken,
    window,
    workspace,
    Uri,
    TextDocumentShowOptions,
    TextEditor,
    TextEditorRevealType,
    Position,
    Range,
    commands
} from "vscode"
import { bytesToHex, encodeUtf8, hexToBytes } from "@helios-lang/codec-utils"
import { Program } from "@helios-lang/compiler"
import { type ErrorCollector } from "@helios-lang/compiler-utils"
import { blake2b } from "@helios-lang/crypto"
import {
    boolToUplcData,
    decodeUplcData,
    makeByteArrayData,
    makeConstrData,
    makeIntData,
    makeListData,
    makeMapData,
    type UplcData,
    type UplcProgramV2
} from "@helios-lang/uplc"
import { loadWebview } from "./webview"
import { ValueViewsProvider } from "./ValueViewsProvider"
import { TypeSchemasProvider } from "./TypeSchemasProvider"
import { ValuesProvider } from "./ValuesProvider"
import {
    collectEntryPointInfo,
    collectErrorUris,
    collectValidators as collectValidators,
    compileEntryPoint,
    entryPointIsConst
} from "./ast"
import { ASTProvider } from "./ASTProvider"

type UPLCProgramWithArgs = {
    args: UplcData[] | undefined // undefined is used for consts that don't depend on script context
    uplcProgram: UplcProgramV2
}

const ARGS_VIEW_REL_PATH = ["dist", "ArgsView", "index.html"]

/**
 * ArgsViewProvider should only be concerned with converting the ast into entry point and arguments names, then catch form edit operations and store the form state in an accessible way
 * ArgsViewProvider should not be concerned with compilation of the entry point and creation of the UplcData args
 * The create/edit value event should trigger a callback
 */
export class ArgsViewProvider implements WebviewViewProvider {
    private readonly extensionContext: ExtensionContext
    private readonly astProvider: ASTProvider
    private readonly schemasProvider: TypeSchemasProvider
    private readonly valuesProvider: ValuesProvider
    private readonly valueViewsProvider: ValueViewsProvider

    private view: WebviewView | undefined
    private ast: Program | undefined
    private entryPoint: string | undefined
    private entryPointHistory: Record<string, string>

    constructor(
        extensionContext: ExtensionContext,
        astProvider: ASTProvider,
        schemasProvider: TypeSchemasProvider,
        valuesProvider: ValuesProvider,
        valueViewsProvider: ValueViewsProvider
    ) {
        this.extensionContext = extensionContext
        this.astProvider = astProvider
        this.schemasProvider = schemasProvider
        this.valuesProvider = valuesProvider
        this.valueViewsProvider = valueViewsProvider

        this.view = undefined
        this.ast = undefined
        this.entryPoint = undefined
        this.entryPointHistory = {}

        this.astProvider.addCompileActiveDocumentListener(
            (ast: Program | undefined) => {
                this.setAST(ast)
            }
        )

        this.schemasProvider.addListener((schemas) => {
            this.view?.webview?.postMessage({
                kind: "TypeSchemas",
                schemas
            } satisfies TypeSchemasContext)
        })

        this.valuesProvider.addListener((store) => {
            this.view?.webview?.postMessage({
                kind: "ValueStore",
                store
            } satisfies ValueStoreContext)
        })

        extensionContext.subscriptions.push(
            window.registerWebviewViewProvider(
                "helios.entryPointAndArguments",
                this
            )
        )
    }

    setAST(ast: Program | undefined) {
        this.ast = ast
        this.syncAST()
    }

    resolveWebviewView(
        view: WebviewView,
        _context: WebviewViewResolveContext<any>,
        _token: CancellationToken
    ) {
        this.view = view

        this.view.webview.options = {
            enableScripts: true
        }

        this.view.webview.onDidReceiveMessage(async (unknownEvent: unknown) => {
            try {
                const event = Schema.decodeUnknownSync(PanelEvent)(unknownEvent)

                switch (event.kind) {
                    case "ChangeEntryPoint":
                        this.handleChangeEntryPoint(event)
                        break
                    case "ChangeFieldValue":
                        this.valuesProvider.handleChangeFieldValue(event)
                        break
                    case "ClickError":
                        this.handleClickError(event)
                        break
                    case "CreateValue":
                        this.valueViewsProvider.handleCreateValue(event)
                        break
                    case "EditValue":
                        this.valueViewsProvider.handleEditValue(event)
                        break
                    case "PanelIsReady":
                        this.handlePanelIsReady()
                        break
                }
            } catch (e) {
                console.error(
                    `invalid event (${(e as Error).message}) (${JSON.stringify(unknownEvent)})`
                )
            }
        })

        // shoot and forget (only async read from disc is supported)
        loadWebview(this.extensionContext, ARGS_VIEW_REL_PATH, view.webview)
    }

    compileProgramAndArgs(
        argsOverride?: string[]
    ): UPLCProgramWithArgs | undefined {
        const uplcProgram = compileEntryPoint(this.ast, this.entryPoint)
        if (!uplcProgram) {
            return undefined
        }

        const args =
            argsOverride?.map((arg) => decodeUplcData(arg)) ??
            this.compileArgs()
        if (!args) {
            return undefined
        }

        return {
            args:
                args.length > 0
                    ? args
                    : entryPointIsConst(this.ast, this.entryPoint)
                      ? undefined
                      : args, // TODO: zero args is different from undefined though for const
            uplcProgram
        }
    }

    get debugSources() {
        const ast = this.ast
        if (!ast) return undefined
        const source = ast.entryPoint.mainModule.sourceCode
        return {
            main: { name: source.name, content: source.content },
            modules: ast.entryPoint.mainImportedModules.map((m) => ({
                name: m.sourceCode.name,
                content: m.sourceCode.content
            })),
            validators: collectValidators(ast)
        }
    }

    private compileArgs(): UplcData[] | undefined {
        const ast = this.ast
        const entryPointInfo = collectEntryPointInfo(ast, this.entryPoint)
        if (!ast || !entryPointInfo) {
            return undefined
        }

        const contextKey = `${ast.name}::${entryPointInfo.name}`
        const args: UplcData[] = []

        for (let argInfo of entryPointInfo.args) {
            const argName = argInfo.name

            if (argName == "_") {
                args.push(makeIntData(0))
                continue
            }

            let argValue =
                this.valuesProvider.store.values[contextKey]?.[argName]
            if (!argValue) {
                const schema = resolveSchema(
                    this.schemasProvider.schemas,
                    argInfo.type
                )
                argValue = makeDefaultValue(schema)
            }

            try {
                if (argInfo.optional) {
                    args.push(makeConstrData(0, [decodeUplcData(argValue)]))
                } else {
                    args.push(decodeUplcData(argValue))
                }
            } catch (e) {
                return undefined
            }
        }

        if (entryPointInfo.needsScriptContext) {
            let argValue =
                this.valuesProvider.store.values[contextKey]?.["ScriptContext"]
            if (!argValue) {
                argValue = makeDefaultValue({
                    kind: "internal",
                    name: "ScriptContext"
                })
            }

            try {
                args.push(decodeUplcData(argValue))
            } catch (e) {
                return undefined
            }
        }

        if (entryPointInfo.needsCurrentValidator) {
            let argValue =
                this.valuesProvider.store.values[contextKey]?.[
                    "::CurrentValidator"
                ]

            if (!argValue) {
                argValue = bytesToHex(makeConstrData(0, []).toCbor())
            }

            try {
                args.push(decodeUplcData(argValue))
            } catch (e) {
                return undefined
            }
        }

        return args
    }

    private handleChangeEntryPoint(event: ChangeEntryPointEvent) {
        this.entryPoint = event.entryPointName
        this.entryPointHistory[this.ast?.name ?? ""] = event.entryPointName

        this.syncAST()
    }

    private handleClickError(event: ClickErrorEvent) {
        const rawUri = event.errorUri

        const e = this.ast?.errors.errors.find((e) => e.site.file == rawUri)

        const uri = Uri.parse(rawUri)

        if (e) {
            focusOrOpenTextEditorAtPos(uri, {
                line: e.site.line + 1,
                column: e.site.column + 1
            })
        } else {
            focusOrOpenTextEditor(uri)
        }
    }

    private handlePanelIsReady() {
        this.view?.webview?.postMessage({
            kind: "TypeSchemas",
            schemas: this.schemasProvider.schemas
        } satisfies TypeSchemasContext)

        this.view?.webview?.postMessage({
            kind: "ValueStore",
            store: this.valuesProvider.store
        } satisfies ValueStoreContext)

        this.syncAST()
    }

    private syncAST(): void {
        const ast = this.ast

        if (!ast) {
            this.view?.webview?.postMessage({
                kind: "PanelLoading"
            } satisfies PanelLoadingContext)
            return
        }

        const moduleName: string = ast.entryPoint.mainModule.name.value
        const moduleUri: string = ast.entryPoint.mainModule.name.site.file
        const modulePurpose: string = ast.purpose
        const errorUris: string[] = collectErrorUris(ast.errors)
        const allValidators: { name: string; purpose: string }[] =
            collectValidators(ast)

        // send the list of entrypoints
        const allEntryPoints: string[] =
            errorUris.length == 0 ? collectEntryPoints(ast) : []

        if (allEntryPoints.length == 0) {
            this.entryPoint = undefined
        } else if (
            !this.entryPoint ||
            !allEntryPoints.includes(this.entryPoint)
        ) {
            // try historical entry point first
            this.entryPoint =
                this.entryPointHistory[moduleName] ?? allEntryPoints[0]
        }

        this.view?.webview?.postMessage({
            kind: "ArgsPanel",
            moduleName,
            moduleUri,
            modulePurpose,
            errorUris,
            allValidators,
            allEntryPoints,
            entryPoint: collectEntryPointInfo(ast, this.entryPoint)
        } satisfies ArgsPanelContext)
    }
}

type FocusOrOpenTextEditorOptions = {
    line: number // 1-based
    column?: number // 1-based, defaults to 1
    reveal?: TextEditorRevealType // defaults to TextEditorRevealType.InCenterIfOutsideViewport
    docShowOpts?: TextDocumentShowOptions
}

/**
 * Focus the editor showing `uri` if it's already open; otherwise open it.
 * @param uri
 * The file URI to focus/open.
 *
 * @param options
 */
async function focusOrOpenTextEditorAtPos(
    uri: Uri,
    options: FocusOrOpenTextEditorOptions
): Promise<TextEditor> {
    const docShowOpts = options.docShowOpts ?? {}

    const editor = await focusOrOpenTextEditor(uri, docShowOpts)
    const doc = editor.document

    // Convert to 0-based and clamp
    const l0 = Math.max(0, Math.min(doc.lineCount - 1, (options.line | 0) - 1))
    const maxCol = doc.lineAt(l0).range.end.character
    const c0 = Math.max(0, Math.min(maxCol, (options.column ?? 1) - 1))
    const pos = new Position(l0, c0)
    const range = new Range(pos, pos)

    const reveal =
        options.reveal ?? TextEditorRevealType.InCenterIfOutsideViewport
    editor.revealRange(range, reveal)

    return editor
}

/**
 * Focus the editor showing `uri` if it's already open; otherwise open it.
 * @param uri
 * The file URI to focus/open.
 *
 * @param options
 * Optional VS Code show options (selection, preview, preserveFocus, etc.)
 */
async function focusOrOpenTextEditor(
    uri: Uri,
    options: TextDocumentShowOptions = {}
): Promise<TextEditor> {
    // Look for an already visible editor with this document
    const match = window.visibleTextEditors.find(
        (editor) => editor.document.uri.toString(true) === uri.toString(true)
    )

    if (match) {
        // Reveal in the same group it’s already in
        return window.showTextDocument(match.document, {
            viewColumn: match.viewColumn,
            preserveFocus: false,
            ...options
        })
    }

    // Not visible: if the doc is already open but hidden, this will reuse it;
    // otherwise it loads from disk and opens it.
    const doc = await workspace.openTextDocument(uri)

    return window.showTextDocument(doc, {
        preserveFocus: false,
        preview: false,
        ...options
    })
}

function collectEntryPoints(ast: Program): string[] {
    let entryPoints: string[] = []

    const key = ast.entryPoint.mainModule.name.value

    if (key in ast.userFunctions) {
        entryPoints = Object.keys(ast.userFunctions[key])
    }

    if (ast.entryPoint.purpose != "module" && ast.entryPoint.mainFunc) {
        entryPoints.push("main")
    }

    return entryPoints
}
