import { usePanelContext } from "components"
import { type ValuePanelContext } from "schemas"

export function useValuePanelContext(): undefined | ValuePanelContext {
    const panelContext = usePanelContext()

    if (panelContext?.kind == "ValuePanel") {
        return panelContext
    } else {
        return undefined
    }
}
