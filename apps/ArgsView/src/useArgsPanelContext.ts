import { usePanelContext } from "components"
import { type ArgsPanelContext } from "schemas"

export function useArgsPanelContext(): undefined | ArgsPanelContext {
    const panelContext = usePanelContext()

    if (panelContext?.kind == "ArgsPanel") {
        return panelContext
    } else {
        return undefined
    }
}
