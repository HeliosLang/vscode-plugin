import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"

/** Append without rewriting existing configurations or their JSONC comments. */
export function appendLaunchConfiguration(
    raw: string,
    config: { type: string; request: string; name: string }
): string {
    const errors: ParseError[] = []
    const data = parse(raw, errors, { allowTrailingComma: true })
    if (errors.length || !data || typeof data !== "object" || Array.isArray(data)) {
        return raw
    }

    const configs = data.configurations
    // Do not replace malformed user data while the file is being edited.
    if (configs !== undefined && !Array.isArray(configs)) {
        return raw
    }
    if (configs?.some((c: any) =>
        c?.type === config.type && c?.request === config.request && c?.name === config.name
    )) {
        return raw
    }

    const options = {
        formattingOptions: {
            insertSpaces: true,
            tabSize: 2,
            eol: raw.includes("\r\n") ? "\r\n" : "\n"
        }
    }
    let updated = applyEdits(raw, modify(
        raw,
        configs ? ["configurations", -1] : ["configurations"],
        configs ? config : [config],
        options
    ))
    if (data.version == null) {
        updated = applyEdits(updated, modify(updated, ["version"], "0.2.0", options))
    }
    return updated
}
