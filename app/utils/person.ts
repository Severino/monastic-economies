/** TEI @sex: ISO 5218 numbers (1 male, 2 female) or letters/words; anything else is unknown. */
export function sexOf(s?: string): "male" | "female" | undefined {
    const v = s?.trim().toLowerCase()
    if (v === "1" || v === "m" || v === "male") return "male"
    if (v === "2" || v === "f" || v === "female") return "female"
    return undefined
}
