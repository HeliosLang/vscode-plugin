import {
    existsSync,
    statSync
} from "fs"

import {
	dirname,
	extname,
    join as joinPath
} from "path"

import {
    Diagnostic,
    DiagnosticCollection,
    DiagnosticSeverity,
    FileType,
    Position,
    Range,
    Uri,
    workspace
} from "vscode"

import { 
    compareVersions,
    HeliosLibrary 
} from "./library"


export function isHeliosExt(fileName: string): boolean {
	const ext = extname(fileName)

	return ext == ".hl" || ext == ".helios"
}

class Script {
    #path: string
    #src: any
    #ast: any | null

    constructor(path: string, src: any) {
        this.#path = path
        this.#src = src
        this.#ast = null
    }

    get ast(): any | null {
        return this.#ast
    }

    get dir(): string {
        return dirname(this.#path)
    }

    get path(): string {
        return this.#path
    }

    get src(): any {
        return this.#src
    }

    get uri(): Uri {
        return Uri.file(this.#path)
    }

    isClean(): boolean {
        return this.#src.errors.length == 0
    }

    // doesn't yet build the ast
    static async init(helios: HeliosLibrary, path: string): Promise<Script> {
        const { Source } = helios

        const file = await workspace.fs.readFile(Uri.file(path))

        const raw = new TextDecoder("utf-8").decode(file)

        const src = new Source(raw) // doesn't yet contain any errors
        
        return new Script(path, src)
    }

    async parse(helios: HeliosLibrary, scripts: {[name: string]: Script}) {
        const { buildScript, extractScriptPurposeAndName, Source, Tokenizer } = helios

		helios.setImportPathTranslator((str: any) => {
			const relPath = str.value;

			let path = joinPath(this.dir, relPath)

            if (!(path in scripts)) {
                if (existsSync(path) && statSync(path).isDirectory()) {
                    path = joinPath(path, "index.hl")
                } else if (!extname(path)) {
                    if (existsSync(path + ".hl")) {
                        path += ".hl"
                    } else if (existsSync(path + ".helios")) {
                        path += ".helios"
                    }
                }
            }

			if (!(path in scripts)) {
                console.log(path, " not in ", Object.keys(scripts))
				str.syntaxError("not a helios scripts");
				return null;
			} else if (path == this.#path) {
				str.syntaxError("can't import self");
				return null;
			} else {
                const maybeNameAndPurpose = extractScriptPurposeAndName(scripts[path].src.raw)

                if (!maybeNameAndPurpose) {
                    str.syntaxError("invalid header in imported file")
                    return null
                }

                return maybeNameAndPurpose[1]
			}
		})

		const ts = (new Tokenizer(this.#src)).tokenize()

		if (this.#src.errors.length == 0) {
			this.#ast = buildScript(ts);
		}
    }

    collectErrors(diagnostics: DiagnosticCollection) {
        const fileDiagnostics: Diagnostic[] = []

        let e = this.#src.errors.shift();
        while (e) {
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

            e = this.#src.errors.shift();
        }

		diagnostics.set(this.uri, fileDiagnostics)
    }
}

async function readDir(dir: string): Promise<[string, FileType][]> {
    const entries = await workspace.fs.readDirectory(Uri.file(dir))

    return entries.map(([relPath, type]) => {
        const subPath = joinPath(dir, relPath)

        return [subPath, type]
    })
}

// TODO: only eval types of the minimum
export function evalTypes(helios: HeliosLibrary, allScripts: [null | string, any | null, any[], number][]) {
    const { assertDefined, Module, MainModule, ValidatorHashType, MintingPolicyHashType, GlobalScope, ModuleScope, TopScope } = helios
	

	// only handle scripts which actually have a valid script puropose and name
	const scripts: [string, any, any[], number][] = []
	
	allScripts.forEach(s => {
		if (s[0] !== null && s[1] !== null) {
			scripts.push([
				assertDefined(s[0]), 
				assertDefined(s[1]), 
				assertDefined(s[2]), 
				s[3]
			])
		}
	})

	// sort in a particular order
	const modules = scripts.filter(s => s[0] == "module").map(s => new Module(assertDefined(s[1]), assertDefined(s[2])))

	const entryPoints = scripts.filter(s => s[0] != "module").map(s => new MainModule(assertDefined(s[1]), assertDefined(s[2])))

	const sorted: any[] = []

	const done: Set<string> = new Set()

	const add = (m: any) => {
		if (!done.has(m.name.value)) {
			sorted.push(m)
			done.add(m.name.value)
		}
	}

	for (let m of modules) {
		if (!done.has(m.name.value)) {
			m.filterDependencies(modules).forEach(add)
			add(m)
		}
	}

	entryPoints.forEach(add)

	// collect validatorTypes
	const validatorTypes: {[name: string]: any} = {}

	scripts.forEach(ep => {
		if (ep[0] == "spending") {
			validatorTypes[ep[1].value] = ValidatorHashType
		} else if (ep[0] == "minting") {
			validatorTypes[ep[1].value] = MintingPolicyHashType
		}
	})

	const globalScope = GlobalScope.new(validatorTypes)

	const topScope = new TopScope(globalScope)

	// loop through the modules

	for (let i = 0; i < sorted.length; i++) {
		const m = sorted[i]

		// reuse main ModuleScope for post module
		const moduleScope = new ModuleScope(topScope)

		m.evalTypes(moduleScope)

		topScope.setScope(m.name, moduleScope)
	}
}

export class Repository {
    #path: string // package.json path
    #version: string
    #lastLoaded: Date
    #scripts: {[name: string]: Script}
    
    constructor(path: string, version: string, lastModified: Date) {
        this.#path = path
        this.#version = version
        this.#lastLoaded = lastModified
        this.#scripts = {}
    }

    get path(): string {
        return this.#path
    }

    get dir(): string {
        return dirname(this.path)
    }

    get scripts(): Script[] {
        return Object.values(this.#scripts)
    }

    get version(): string {
        return this.#version
    }

    // when package.json was last loaded
    get lastLoaded(): Date {
        return this.#lastLoaded
    }

    async init(helios: HeliosLibrary) {
        if (Object.keys(this.#scripts).length > 0) {
            return
        }

        let stack = await readDir(this.dir)

        let item = stack.pop()

        while (item) {
            let [path, type] = item

            if (type == FileType.Directory && !path.endsWith("node_modules")) {
                stack = stack.concat(await readDir(path))
            } else if (type == FileType.File && isHeliosExt(path)) {
                this.#scripts[path] = await Script.init(helios, path)
            } else {
                // ignoring
            }

            item = stack.pop()
        }
    }

    updateFile(helios: HeliosLibrary, path: string, src: string) {
        const { Source } = helios

        if (!(path in this.#scripts) || ((path in this.#scripts) && (this.#scripts[path].src.raw != src))) {
            this.#scripts[path] = new Script(path, new Source(src))
        }
    }

    async diagnose(helios: HeliosLibrary, diagnostics: DiagnosticCollection) {
        // no need to re-diagnose if nothing changed (a change would reset the ast to null)
        if (this.scripts.every(s => s.ast !== null )) {
            return
        }

        for (let s of this.scripts) {
            await s.parse(helios, this.#scripts)
        }

        // only do type evaluation of the clean scripts
        if (compareVersions(helios.VERSION, "v0.14.3") >= 0) {
            const filtered = this.scripts.filter(s => s.ast != null)

            if (filtered.length > 0) {
                evalTypes(helios, filtered.map(f => f.ast))
            }
        }

        this.scripts.forEach(s => s.collectErrors(diagnostics))
    }
}