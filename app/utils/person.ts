/** TEI @sex: ISO 5218 numbers (1 male, 2 female) or letters/words; anything else is unknown. */
export function sexOf(s?: string): "male" | "female" | undefined {
    const v = s?.trim().toLowerCase()
    if (v === "1" || v === "m" || v === "male") return "male"
    if (v === "2" || v === "f" || v === "female") return "female"
    return undefined
}

/** Sex as a filter category: male, female, unknown (a value that says so, e.g. ISO 5218 0 or 9), none (not recorded). */
export type SexCategory = "male" | "female" | "unknown" | "none"
export function sexCategory(s?: string): SexCategory {
    if (!s?.trim()) return "none"
    return sexOf(s) ?? "unknown"
}
