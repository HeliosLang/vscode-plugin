import { useMemo } from "react"
import { type ValuePanelContext } from "schemas"

const DEFAULT_RESERVED_NAMES = ["NIL"]

export function useReservedNames(context: ValuePanelContext): Set<string> {
    return useMemo(() => {
        let reserved = new Set(DEFAULT_RESERVED_NAMES)

        switch (context.typeName) {
            case "AssetClass":
                reserved.add("ADA")
                break
            case "MintingPolicyHash":
                reserved.add("ADA")
                context.allValidators.forEach(v => {
                    if (["mixed", "minting"].includes(v.purpose)) {
                        reserved.add(v.name)
                    }
                })
                break
            case "ValidatorHash":
                context.allValidators.forEach(v => {
                    if (["mixed", "spending"].includes(v.purpose)) {
                        reserved.add(v.name)
                    }
                })
                break
            case "StakingValidatorHash":
                context.allValidators.forEach(v => {
                    if (["mixed", "staking"].includes(v.purpose)) {
                        reserved.add(v.name)
                    }
                })
                break
            case "ScriptHash":
                context.allValidators.forEach(v => {
                    if (["mixed", "minting", "spending", "staking"].includes(v.purpose)) {
                        reserved.add(v.name)
                    }
                })
                break
            default:
        }

        return reserved
    }, [context])
}