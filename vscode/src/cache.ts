import {
    existsSync,
    readFileSync,
    statSync
} from "fs"

import {
    dirname,
    join as joinPath
} from "path"

export type HeliosLibrary = {
    VERSION: string
    Tokenizer: any
    Source: any
    buildScript: any
    setImportPathTranslator: any
}

class Repository {
    #path: string
    #version: string
    #lastLoaded: Date
    
    constructor(path: string, version: string, lastModified: Date) {
        this.#path = path
        this.#version = version
        this.#lastLoaded = lastModified
    }

    get path(): string {
        return this.#path
    }

    get version(): string {
        return this.#version
    }

    get lastLoaded(): Date {
        return this.#lastLoaded
    }
}

function parseVersion(v: string): number[] {
	if (v.startsWith("v")) {
		v = v.slice(1);
	}

	let parts = v.split(".");

	return parts.map(p => (p != undefined ? parseInt(p) : 0));
}

function compareVersions(va: string, vb: string) {
	let a = parseVersion(va);
	let b = parseVersion(vb);

	if (a[0] == b[0]) {
		if (a[1] == b[1]) {
			return a[2] - b[2];
		} else {
			return a[1] - b[1];
		}
	} else {
		return a[0] - b[0];
	}
}

// maps Helios versions to the actual library
// maps fileNames to packageJson fileNames (assumes files are very rarely moved between repositories)
// check the last modification date of packageJson files (a more recent version of Helios could've been installed while the IDE is open)
export class HeliosLibraryCache {
    #versions: {[version: string]: HeliosLibrary}
    #repositories: {[path: string]: Repository}
    #files: {[path: string]: string}

    constructor() {
        this.#versions = {}
        this.#repositories = {}
        this.#files = {}
    }

    // returns the library version or null
    private loadLibrary(libPath: string): (string | null) {
        try {

            // can't use import because it isn't available inside vsce package
            let heliosSrc = readFileSync(libPath).toString()
            heliosSrc = heliosSrc.replace(/^\ *export /gm, "")
            heliosSrc = `${heliosSrc}
            
const exportedForVSCode = {
    VERSION,
    Tokenizer,
    Source,
    buildScript,
    setImportPathTranslator
};

exportedForVSCode`

            const lib = function() {
                return eval(heliosSrc)
            }() as HeliosLibrary;

            const version = lib.VERSION

            if (version && compareVersions(version, "v0.13.22") >= 0) {
                if (!this.#versions[version]) {
                    this.#versions[version] = lib
                }

                return version
            } else {
                return null;
            }
        } catch(e: any) {
            return null
        }
    }

    // search parent directories  for package.json
    private findRepository(fileName: string): (null | string) {
        let repoPath = this.#files[fileName]

        if (repoPath) {
            return repoPath
        } else {
            let p = fileName

            while (!repoPath && p.length > 1) {
                p = dirname(p)

                const maybeRepoPath = joinPath(p, "package.json")

                if (existsSync(maybeRepoPath)) {
                    repoPath = maybeRepoPath
                }
            }

            if (repoPath) {
                this.#files[fileName] = repoPath

                return repoPath
            } else {
                return null
            }
        }
    }

    private loadRepository(path: string): (null | Repository) {
        try {
            const contents: any = JSON.parse(readFileSync(path).toString())

            if ((contents?.dependencies["@hyperionbt/helios"]) ?? (contents?.devDependencies["@hyperionbt/helios"]) ?? "") {
                const version = this.loadLibrary(joinPath(dirname(path), "node_modules/@hyperionbt/helios/helios.js"))
    
                if (version) {
                    const repo = new Repository(path, version, new Date())

                    this.#repositories[path] = repo

                    return repo
                } else {
                    return null
                }
            } else {
                return null
            }
        } catch(e) {
            return null
        }
    }

    private loadCachedRepository(path: string): (null | Repository) {
        let repo: (null | Repository) = this.#repositories[path]

        if (repo) {
            try {
                const stat = statSync(repo.path)
    
                if (stat.mtime.getTime() > repo.lastLoaded.getTime()) {
                    repo = this.loadRepository(repo.path)
                }
            } catch(e ) {
                return null
            }
        } else {
            repo = this.loadRepository(path)
        }

        return repo
    }

    loadCachedLibrary(fileName: string): (null | HeliosLibrary) {
        const repoPath = this.findRepository(fileName)

        if (repoPath) {
            const repo = this.loadCachedRepository(repoPath)

            if (repo) {
                const lib = this.#versions[repo.version]

                if (lib) {
                    return lib
                }
            }
        }

        return null
    }
}