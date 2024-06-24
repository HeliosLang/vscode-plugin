import {
	languages
} from "vscode"

import {
    Cache
} from "./cache"

export function registerHoverProvider(cache: Cache) {
    languages.registerHoverProvider("helios", {
		provideHover: (document, position, token) => {
            const lib = cache.loadCachedLibrary(document.fileName)

            if (lib) {
                return {
                    contents: [`Helios v${lib.VERSION}`]
                }
            } else {
                return {
                    contents: []
                }
            }
		}
	})
}