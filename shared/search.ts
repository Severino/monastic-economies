// MiniSearch options must be identical when building and loading the index.
export const SEARCH_OPTIONS = {
    fields: ["title", "text", "persons", "places"],
    storeFields: ["title"],
    // text match: every word must occur (as a word or word prefix); no fuzzy matching,
    // so every hit can be highlighted in the text
    searchOptions: {
        prefix: true,
        fuzzy: false,
        combineWith: "AND",
        boost: { title: 2, persons: 1.5, places: 1.5 },
    },
}

/** Query words, lower-cased, as MiniSearch tokenizes them. */
export function queryTerms(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
}

/** Regex matching every query word at the start of a word (same rule as the search). */
export function highlightRegex(query: string): RegExp | null {
    const terms = queryTerms(query)
    if (!terms.length) return null
    const esc = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length)
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${esc.join("|")})`, "giu")
}

export interface TextPart {
    text: string
    hit: boolean
}

/** Splits a string into highlighted / plain parts. */
export function markParts(text: string, re: RegExp | null): TextPart[] {
    if (!re) return [{ text, hit: false }]
    const parts: TextPart[] = []
    let last = 0
    for (const m of text.matchAll(re)) {
        if (m.index! > last) parts.push({ text: text.slice(last, m.index), hit: false })
        parts.push({ text: m[0], hit: true })
        last = m.index! + m[0].length
    }
    if (last < text.length) parts.push({ text: text.slice(last), hit: false })
    return parts
}

/** Short excerpt around the first match, with the number of matches in the text. */
export function snippet(text: string, re: RegExp | null, radius = 70): { parts: TextPart[]; count: number } | null {
    if (!re) return null
    const matches = [...text.matchAll(re)]
    if (!matches.length) return null
    const first = matches[0]!.index!
    let start = Math.max(0, first - radius)
    let end = Math.min(text.length, first + matches[0]![0].length + radius * 2)
    if (start > 0) start = text.indexOf(" ", start) + 1 || start
    if (end < text.length) end = text.lastIndexOf(" ", end) > first ? text.lastIndexOf(" ", end) : end
    const excerpt = (start > 0 ? "… " : "") + text.slice(start, end) + (end < text.length ? " …" : "")
    return { parts: markParts(excerpt, re), count: matches.length }
}
