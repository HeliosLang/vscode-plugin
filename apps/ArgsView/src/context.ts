import { Schema } from "effect"
import { useEffect, useState } from "react"
import { EntryPointViewContext, FileViewContext } from "schemas"

function createContextHook<T>(schema: Schema.Schema<T>): T | undefined {
    const [context, setContext] = useState<undefined | T>(undefined)

    useEffect(() => {
        const listener = (event: MessageEvent) => {
            try {
                const ctx = Schema.decodeUnknownSync(schema)(event.data)
                setContext(ctx)
            } catch (_) {}
        }

        window.addEventListener("message", listener)

        return () => window.removeEventListener("message", listener)
    }, [setContext])

    return context
}

/**
 * React hook that subscribes to window.postMessage events.
 * Cleans up automatically on unmount.
 */
export function useFileViewContext() {
    return createContextHook(FileViewContext)
}

export function useEntryPointViewContext() {
    return createContextHook(EntryPointViewContext)
}
