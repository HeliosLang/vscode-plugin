import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"

/** Replace every Helios entry with one minimal entry, preserving other debuggers. */
export function synchronizeHeliosLaunchConfiguration(
    raw: string,
    config: { type: string; request: string; name: string }
): string {
    const errors: ParseError[] = []
    const data = parse(raw, errors, { allowTrailingComma: true })
    if (
        errors.length ||
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        return raw
    }

    const configs = data.configurations
    // Do not replace malformed user data while the file is being edited.
    if (configs !== undefined && !Array.isArray(configs)) {
        return raw
    }
    const options = {
        formattingOptions: {
            insertSpaces: true,
            tabSize: 2,
            eol: raw.includes("\r\n") ? "\r\n" : "\n"
        }
    }
    let updated = raw
    if (configs) {
        const heliosIndices = configs
            .map((candidate: any, index: number) =>
                candidate?.type === "helios" ||
                candidate?.type === "heliosdebugger"
                    ? index
                    : -1
            )
            .filter((index: number) => index >= 0)
        if (heliosIndices.length > 0) {
            // Replace the first entry in place so comments belonging to the
            // following non-Helios configuration aren't swallowed by a
            // deletion. Remove only additional stale/legacy entries.
            for (const index of heliosIndices.slice(1).reverse()) {
                updated = applyEdits(
                    updated,
                    modify(
                        updated,
                        ["configurations", index],
                        undefined,
                        options
                    )
                )
            }
            updated = applyEdits(
                updated,
                modify(updated, ["configurations", heliosIndices[0]], config, options)
            )
        } else {
            updated = applyEdits(
                updated,
                modify(updated, ["configurations", -1], config, options)
            )
        }
    } else {
        updated = applyEdits(
            updated,
            modify(updated, ["configurations"], [config], options)
        )
    }
    if (data.version == null) {
        updated = applyEdits(
            updated,
            modify(updated, ["version"], "0.2.0", options)
        )
    }
    return updated
}
