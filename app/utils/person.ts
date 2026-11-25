/** TEI @sex: ISO 5218 numbers (1 male, 2 female) or letters/words; anything else is unknown. */
export function sexOf(s?: string): "male" | "female" | undefined {
    const v = s?.trim().toLowerCase()
    if (v === "1" || v === "m" || v === "male") return "male"
    if (v === "2" || v === "f" || v === "female") return "female"
    return undefined
}

/** Sex as a filter category: male, female, or unknown (not recorded, or neither, e.g. ISO 5218 0 or 9). */
export type SexCategory = "male" | "female" | "unknown"
export const sexCategory = (s?: string): SexCategory => sexOf(s) ?? "unknown"
