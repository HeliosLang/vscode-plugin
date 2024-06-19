import {
    existsSync,
    readFileSync,
    statSync
} from "fs"

import {
    dirname,
    join as joinPath
} from "path"

import {
    HeliosLibrary,
    compareVersions
} from "./library"

import {
    Repository
} from "./repository"


// maps Helios versions to the actual library
// maps fileNames to packageJson fileNames (assumes files are very rarely moved between repositories)
// check the last modification date of packageJson files (a more recent version of Helios could've been installed while the IDE is open)
export class Cache {
    #versions: {[version: string]: HeliosLibrary}
    #repositories: {[path: string]: Repository}
    #files: {[path: string]: string} // map of files to package.json

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

            console.log("Read helios lib from " + libPath)

            heliosSrc = heliosSrc.replace(/^\ *export /gm, "")
            heliosSrc = `${heliosSrc}
            
const exportedForVSCode = {
    VERSION,
    Tokenizer,
    Source,
    buildScript,
    extractScriptPurposeAndName,
    setImportPathTranslator,
    Module,
    MainModule,
    TopScope,
    GlobalScope,
    ModuleScope,
    assertDefined,
    MintingPolicyHashType,
    ValidatorHashType
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
            console.log("Failed to read helios lib from " + libPath + " (" + e.message + ")")
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

    // path points to package.json file
    private loadRepository(path: string): (null | Repository) {
        try {
            const contents: any = JSON.parse(readFileSync(path).toString())

            if ((contents?.dependencies["@hyperionbt/helios"]) ?? (contents?.devDependencies["@hyperionbt/helios"]) ?? (contents?.peerDependencies["@hyperionbt/helios"]) ?? "") {
                const version = this.loadLibrary(joinPath(dirname(path), "node_modules/@hyperionbt/helios/helios.js"))
    
                if (version) {
                    const repo = new Repository(path, version, new Date())

                    this.#repositories[path] = repo

                    return repo
                } else {
                    console.log("Helios library marked as dependency but not installed")
                    return null
                }
            } else {
                console.log("Helios not detected as dependency of " + path)
                return null
            }
        } catch(e: any) {
            console.log("Error while trying to load helios library (" + e.message + ")")
            return null
        }
    }

    loadCachedRepository(fileName: string): (null | Repository) {
        const repoPath = this.findRepository(fileName)

        if (repoPath) {
            let repo: (null | Repository) = this.#repositories[repoPath]

            if (repo) {
                try {
                    const stat = statSync(repo.path)
        
                    if (stat.mtime.getTime() > repo.lastLoaded.getTime()) {
                        repo = this.loadRepository(repo.path)
                    }
                } catch(e: any) {
                    console.log("Unable to load package.json for " + fileName + " (" + e.message + ")")
                    return null
                }
            } else {
                repo = this.loadRepository(repoPath)
            }

            return repo
        } else {
            console.log("No package.json found for " + fileName)
        }

        return null
    }

    loadCachedLibrary(fileName: string): (null | HeliosLibrary) {
        const repo = this.loadCachedRepository(fileName)

        if (repo) {
            const lib = this.#versions[repo.version]

            if (lib) {
                return lib
            } else {
                console.log("No lib found with version " + repo.version)
            }
        } else {
            console.log("No package.json with helios dependency found for " + fileName)
        }

        return null
    }
}