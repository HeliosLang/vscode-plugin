export type HeliosLibrary = {
    VERSION: string
    Tokenizer: any
    Source: any
    buildScript: any
    setImportPathTranslator: any
    extractScriptPurposeAndName: (rawSrc: string) => null | [string, string]
    Module: any
	MainModule: any
	TopScope: any
    GlobalScope: any
	ModuleScope: any
	MintingPolicyHashType: any
	ValidatorHashType: any
	assertDefined: (x: any | undefined) => any
}

export function parseVersion(v: string): number[] {
	if (v.startsWith("v")) {
		v = v.slice(1);
	}

	let parts = v.split(".");

	return parts.map(p => (p != undefined ? parseInt(p) : 0));
}

export function compareVersions(va: string, vb: string) {
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