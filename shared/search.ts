// Charter search: every query word must occur somewhere (anywhere inside a word, so "33" finds "033"),
// ignoring case and diacritics. The data set is small, so a plain scan is fast enough and the
// same rule drives the highlighting: what is marked is exactly what matched.

/** One searchable record per charter (written by the build as search.json). */
export interface SearchDoc {
    id: string
    title: string
    text: string
    persons: string
    places: string
}

/**
 * Lower-cases and strips diacritics character by character, so positions in the
 * folded string are the same as in the original (needed for highlighting).
 */
export function fold(s: string): string {
    let out = ""
    for (let i = 0; i < s.length; i++) {
        const c = s[i]!.toLowerCase().normalize("NFD")[0] ?? s[i]!
        out += c.length === 1 ? c : s[i]!
    }
    return out
}

/** Query words, folded; whitespace separates words, nothing else is special. */
export function queryTerms(query: string): string[] {
    return [...new Set(fold(query.trim()).split(/\s+/).filter(Boolean))]
}

/** Number of non-overlapping occurrences of a folded term in a folded string. */
function count(hay: string, term: string): number {
    let n = 0
    for (let i = hay.indexOf(term); i !== -1; i = hay.indexOf(term, i + term.length)) n++
    return n
}

/** Ids of the matching documents, best first (title hits weigh most, then names, then text). */
export function searchDocs(docs: SearchDoc[], query: string): Map<string, number> {
    const terms = queryTerms(query)
    const out = new Map<string, number>()
    if (!terms.length) return out
    for (const d of docs) {
        const f = { title: fold(d.title), persons: fold(d.persons), places: fold(d.places), text: fold(d.text) }
        let score = 0
        let all = true
        for (const t of terms) {
            const s =
                count(f.title, t) * 5 + (count(f.persons, t) + count(f.places, t)) * 3 + Math.min(count(f.text, t), 20)
            if (!s) {
                all = false
                break
            }
            score += s
        }
        if (all) out.set(d.id, score)
    }
    return new Map([...out].sort((a, b) => b[1] - a[1]))
}

export interface TextPart {
    text: string
    hit: boolean
}

/** Match ranges of all terms in a string, merged where they overlap. */
function ranges(text: string, terms: string[]): [number, number][] {
    const f = fold(text)
    const rs: [number, number][] = []
    for (const t of terms)
        for (let i = f.indexOf(t); i !== -1; i = f.indexOf(t, i + t.length)) rs.push([i, i + t.length])
    rs.sort((a, b) => a[0] - b[0])
    const merged: [number, number][] = []
    for (const r of rs) {
        const last = merged[merged.length - 1]
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
        else merged.push(r)
    }
    return merged
}

function split(text: string, rs: [number, number][]): TextPart[] {
    const parts: TextPart[] = []
    let last = 0
    for (const [a, b] of rs) {
        if (a > last) parts.push({ text: text.slice(last, a), hit: false })
        parts.push({ text: text.slice(a, b), hit: true })
        last = b
    }
    if (last < text.length) parts.push({ text: text.slice(last), hit: false })
    return parts
}

/** Splits a string into highlighted / plain parts. */
export function markParts(text: string, terms: string[]): TextPart[] {
    return terms.length ? split(text, ranges(text, terms)) : [{ text, hit: false }]
}

/** Short excerpt around the first match, with the number of matches in the whole text. */
export function snippet(text: string, terms: string[], radius = 70): { parts: TextPart[]; count: number } | null {
    if (!terms.length) return null
    const rs = ranges(text, terms)
    if (!rs.length) return null
    const [first, firstEnd] = rs[0]!
    let start = Math.max(0, first - radius)
    let end = Math.min(text.length, firstEnd + radius * 2)
    if (start > 0) start = text.indexOf(" ", start) + 1 || start
    if (end < text.length) end = text.lastIndexOf(" ", end) >= firstEnd ? text.lastIndexOf(" ", end) : end
    const excerpt = text.slice(start, end)
    const parts = split(
        excerpt,
        rs.filter(([a, b]) => a >= start && b <= end).map(([a, b]) => [a - start, b - start]),
    )
    if (start > 0) parts.unshift({ text: "… ", hit: false })
    if (end < text.length) parts.push({ text: " …", hit: false })
    return { parts, count: rs.length }
}
