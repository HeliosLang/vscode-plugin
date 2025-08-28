import { useMemo } from "react"
import { type ListData, type UplcData } from "@helios-lang/uplc"

export function useListData(value: UplcData | undefined): ListData | undefined {
    return useMemo(() => {
        if (value && value.kind == "list") {
            return value
        } else {
            return undefined
        }
    }, [value])
}
