export type CompilationOptions = {
    hashDependencies: Record<string, string>
    dependsOnOwnHash: boolean
    validatorIndices?: Record<string, number>
    ownHash?: string
}
export type CompilationContext = {
    version: 1
    compilerVersion: string
    validator: { name: string; purpose: string }
    parameters: Record<string, string>
    isTestnet: boolean
    validatorTypes: Record<string, string>
    optimized: CompilationOptions
    unoptimized: CompilationOptions
}
const object = (v: any) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
const name = (v: any) =>
    typeof v === "string" &&
    /^[A-Za-z_]\w*$/.test(v) &&
    !["__proto__", "constructor", "prototype"].includes(v)
const record = (
    v: any,
    key: (k: string) => boolean,
    value: (v: any) => boolean
) => object(v) && Object.entries(v).every(([k, x]) => key(k) && value(x))
const hash = (v: any) => typeof v === "string" && /^[a-f0-9]{56}$/.test(v)
const hex = (v: any) => typeof v === "string" && /^(?:[a-f0-9]{2})+$/.test(v)
const keys = (v: any, allowed: string[]) =>
    Object.keys(v).every((k) => allowed.includes(k))
const options = (v: any) =>
    object(v) &&
    keys(v, [
        "hashDependencies",
        "dependsOnOwnHash",
        "validatorIndices",
        "ownHash"
    ]) &&
    typeof v.dependsOnOwnHash === "boolean" &&
    record(
        v.hashDependencies,
        name,
        (x: any) =>
            x === "#" ||
            hash(x) ||
            (typeof x === "string" && /^#[a-f0-9]{56}$/.test(x))
    ) &&
    (v.ownHash === undefined || hash(v.ownHash)) &&
    (v.validatorIndices === undefined ||
        record(
            v.validatorIndices,
            name,
            (x: any) => Number.isSafeInteger(x) && x >= 0
        ))
/** @param {unknown} value @returns {value is CompilationContext} */
export function validCompilationContext(
    value: unknown
): value is CompilationContext {
    const v = value as any
    return (
        object(v) &&
        keys(v, [
            "version",
            "compilerVersion",
            "validator",
            "parameters",
            "isTestnet",
            "validatorTypes",
            "optimized",
            "unoptimized"
        ]) &&
        v.version === 1 &&
        typeof v.compilerVersion === "string" &&
        /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(v.compilerVersion) &&
        object(v.validator) &&
        keys(v.validator, ["name", "purpose"]) &&
        name(v.validator.name) &&
        [
            "spending",
            "minting",
            "staking",
            "mixed",
            "certifying",
            "rewarding"
        ].includes(v.validator.purpose) &&
        typeof v.isTestnet === "boolean" &&
        record(
            v.parameters,
            (k: string) =>
                k.split("::").length >= 2 && k.split("::").every(name),
            hex
        ) &&
        record(v.validatorTypes, name, (x: any) =>
            [
                "ValidatorHash",
                "MintingPolicyHash",
                "StakingValidatorHash",
                "ScriptHash"
            ].includes(x)
        ) &&
        options(v.optimized) &&
        options(v.unoptimized)
    )
}
