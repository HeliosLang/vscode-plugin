import { Schema } from "effect"
import { useSyncExternalStore } from "react"
import {
    PanelContext,
    PanelIsReadyEvent,
    Store,
    ValueStoreContext,
    TypeSchemasContext
} from "schemas"
import { useVsCodeApi } from "./vscode"

// TODO: ValueViewPanelContext
const Contexts = Schema.Union(
    PanelContext,
    ValueStoreContext,
    TypeSchemasContext
)

export type Context = Schema.Schema.Type<typeof Contexts>

type State = {
    panelContext: PanelContext
    store: Store
    schemas: Record<string, any>
}

const INITIAL_STATE: State = {
    panelContext: { kind: "PanelLoading" },
    schemas: {},
    store: { values: {}, links: {} }
}

let state: State = INITIAL_STATE
const listeners = new Set<() => void>()
let isWired = false

function reducer(s: State, context: Context): State {
    switch (context.kind) {
        case "ValueStore":
            if (isEqual(s.store, context)) {
                return s
            } else {
                return { ...s, store: context.store }
            }
        case "TypeSchemas":
            if (isEqual(s.schemas, context)) {
                return s
            } else {
                return { ...s, schemas: context.schemas }
            }
        case "PanelLoading":
        case "ArgsPanel":
        case "ValuePanel":
            if (isEqual(s.panelContext, context)) {
                return s
            } else {
                return { ...s, panelContext: context }
            }
    }
}

function isEqual(a: any, b: any): boolean {
    if (a === undefined && b === undefined) {
        return true
    } else if (a !== undefined && b !== undefined) {
        return JSON.stringify(a) == JSON.stringify(b)
    } else {
        return false
    }
}

function setState(next: State) {
    state = next
    listeners.forEach((l) => l())
}

function dispatch(context: Context) {
    setState(reducer(state, context))
}

function getSnapshot(): State {
    return state
}

function wire() {
    if (isWired) {
        return
    }

    isWired = true

    window.addEventListener("message", onMessage)

    const isReadyEvent: PanelIsReadyEvent = {
        kind: "PanelIsReady"
    }

    useVsCodeApi().postMessage(isReadyEvent)
}

function unwire() {
    if (!isWired) {
        return
    }

    isWired = false

    window.removeEventListener("message", onMessage)
}

function onMessage(event: MessageEvent) {
    try {
        const context = Schema.decodeUnknownSync(Contexts)(event.data)

        dispatch(context)
    } catch (_) {}
}

/**
 * Subscribe/unsubscribe; React calls this via useSyncExternalStore.
 */
function subscribe(callback: () => void) {
    if (listeners.size == 0) {
        wire()
    }

    listeners.add(callback)

    return () => {
        listeners.delete(callback)

        if (listeners.size == 0) {
            unwire()
        }
    }
}

/**
 * Read a derived slice to avoid re-renders (selector + equality).
 */
export function useEventSelector<T>(selector: (s: State) => T): T {
    const getSelected = () => selector(getSnapshot())

    let prev = getSelected()

    return useSyncExternalStore(subscribe, () => {
        const next = getSelected()

        if (!Object.is(prev, next)) {
            prev = next
        }
        return prev
    })
}
