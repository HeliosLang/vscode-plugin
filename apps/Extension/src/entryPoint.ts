export function selectEntryPoint(
    available: string[],
    preferred?: string
): string | undefined {
    return preferred && available.includes(preferred)
        ? preferred
        : available.includes("main")
          ? "main"
          : available[0]
}
