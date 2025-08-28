import { useMemo } from "react"
import { decodeUplcData, type UplcData } from "@helios-lang/uplc"

export function useUplcData(value: string | undefined): UplcData | undefined {
    return useMemo(() => {
        if (!value) {
            return undefined
        }

        try {
            return decodeUplcData(value)
        } catch (_) {
            return undefined
        }
    }, [value])
}
