import { useMemo } from "react"
import { type PanelContext, StoreHelper } from "schemas"
import { TypeSchema } from "@helios-lang/type-utils"
import { useEventSelector } from "./state"

export function useStoreHelper(): StoreHelper {
    const s = useEventSelector((state) => state.store)

    return useMemo(() => {
        return new StoreHelper(s)
    }, [s])
}

export function useTypeSchemas(): Record<string, TypeSchema> {
    return useEventSelector((state) => state.schemas)
}

export function usePanelContext(): PanelContext {
    return useEventSelector((state) => state.panelContext)
}

export function useContextKey() {
    const context = usePanelContext()

    switch (context.kind) {
        case "ArgsPanel":
            if (context.entryPoint) {
                return `${context.moduleName}::${context.entryPoint.name}`
            } else {
                throw new Error(
                    "can't generate context key when entry point is still loading"
                )
            }
        case "ValuePanel":
            return `${context.typeName}::${context.valueName}`
        case "PanelLoading":
            throw new Error(
                "can't generate context key when panel is still loading"
            )
    }
}
