// Small DOM helpers for TEI documents parsed with @xmldom/xmldom.
import { DOMParser } from '@xmldom/xmldom'
import type { TeiNode } from '../../shared/types'

export const TEI_NS = 'http://www.tei-c.org/ns/1.0'

// xmldom ships its own DOM types; we only need a few members.
export type El = {
    nodeType: number
    localName: string | null
    namespaceURI: string | null
    attributes: ArrayLike<{ name: string; localName: string | null; value: string }>
    childNodes: ArrayLike<any>
    parentNode: any
    getAttribute(name: string): string | null
    getAttributeNS(ns: string | null, name: string): string | null
    hasAttribute(name: string): boolean
}

export function parseXml(xml: string, onError: (msg: string) => void) {
    return new DOMParser({
        onError: (level: string, msg: string) => {
            if (level !== 'warning') onError(msg)
        },
    }).parseFromString(xml, 'text/xml')
}

export const isEl = (n: any): n is El => n?.nodeType === 1

export function children(el: El | null | undefined, name?: string): El[] {
    if (!el) return []
    return Array.from(el.childNodes).filter((n): n is El => isEl(n) && (!name || n.localName === name))
}

export const child = (el: El | null | undefined, name: string): El | undefined => children(el, name)[0]

/** Follows a path of child element names, e.g. path(tei, 'teiHeader', 'fileDesc'). */
export function path(el: El | null | undefined, ...names: string[]): El | undefined {
    let cur: El | undefined = el ?? undefined
    for (const n of names) cur = child(cur, n)
    return cur
}

export function descendants(el: El, name: string): El[] {
    const out: El[] = []
    const walk = (n: El) => {
        for (const c of children(n)) {
            if (c.localName === name) out.push(c)
            walk(c)
        }
    }
    walk(el)
    return out
}

export const xmlId = (el: El) =>
    el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'id') ?? el.getAttribute('xml:id') ?? undefined

export const xmlLang = (el: El) =>
    el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') ?? el.getAttribute('xml:lang') ?? undefined

export const attr = (el: El | undefined, name: string) => el?.getAttribute(name) || undefined

/** Plain text of an element with collapsed whitespace. */
export function text(el: El | undefined): string {
    if (!el) return ''
    return collapse(rawText(el))
}

function rawText(n: any): string {
    if (n.nodeType === 3 || n.nodeType === 4) return n.data
    if (!isEl(n)) return ''
    return Array.from(n.childNodes).map(rawText).join('')
}

export const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Strips a leading '#' from every token of a reference attribute. */
export const normaliseRefs = (v: string) =>
    v
        .trim()
        .split(/\s+/)
        .map((t) => (t.startsWith('#') ? t.slice(1) : t))
        .join(' ')

const REF_ATTRS = new Set(['ref', 'facs', 'corresp', 'target', 'active', 'passive', 'mutual'])

/**
 * Converts mixed content into the compact TeiNode tree.
 * Whitespace is collapsed to single spaces; leading/trailing whitespace of the
 * whole sequence is trimmed by the caller via trimNodes().
 */
export function toTree(el: El, onRef?: (attr: string, raw: string) => void): TeiNode[] {
    const out: TeiNode[] = []
    for (const n of Array.from(el.childNodes)) {
        if (n.nodeType === 3 || n.nodeType === 4) {
            const s = (n.data as string).replace(/\s+/g, ' ')
            if (!s) continue
            const last = out[out.length - 1]
            if (typeof last === 'string') out[out.length - 1] = last + s
            else out.push(s)
        } else if (isEl(n)) {
            const a: Record<string, string> = {}
            for (const at of Array.from(n.attributes)) {
                if (at.name === 'xmlns' || at.name.startsWith('xmlns:')) continue
                const key = at.name // keeps "xml:id", "xml:lang"
                let value = at.value
                if (REF_ATTRS.has(key)) {
                    onRef?.(key, value)
                    value = normaliseRefs(value)
                }
                a[key] = value
            }
            const c = toTree(n, onRef)
            const node: TeiNode = { t: n.localName ?? '' }
            if (Object.keys(a).length) node.a = a
            if (c.length) node.c = c
            out.push(node)
        }
    }
    return out
}

/** Removes leading/trailing whitespace-only strings and trims the outer text. */
export function trimNodes(nodes: TeiNode[]): TeiNode[] {
    const out = [...nodes]
    while (typeof out[0] === 'string' && !out[0].trim()) out.shift()
    while (typeof out[out.length - 1] === 'string' && !(out[out.length - 1] as string).trim()) out.pop()
    if (typeof out[0] === 'string') out[0] = out[0].trimStart()
    const li = out.length - 1
    if (typeof out[li] === 'string') out[li] = (out[li] as string).trimEnd()
    return out
}

/**
 * Reading text of a tree for search: honours lb[@break="no"] (no space),
 * keeps additions, drops deletions and notes.
 */
export function plainText(nodes: TeiNode[]): string {
    let s = ''
    let join = false // previous token was lb[@break="no"]
    const walk = (ns: TeiNode[]) => {
        for (const n of ns) {
            if (typeof n === 'string') {
                s += join ? n.trimStart() : n
                if (n.trim()) join = false
                continue
            }
            if (n.t === 'del' || n.t === 'note' || n.t === 'metamark') continue
            if (n.t === 'lb' || n.t === 'pb' || n.t === 'cb') {
                if (n.a?.break === 'no') {
                    s = s.replace(/\s+$/, '')
                    join = true
                } else if (!join) s += ' '
                continue
            }
            if (n.c) walk(n.c)
            if (n.t === 'ab' || n.t === 'head' || n.t === 'div') s += ' '
        }
    }
    walk(nodes)
    return collapse(s)
}

/**
 * Within one parent: removes whitespace around lb/pb/cb[@break="no"], so that
 * words split across lines are rendered (and searched) as one word.
 */
export function joinBrokenWords(nodes: TeiNode[]): TeiNode[] {
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        if (typeof n === 'string') continue
        if (n.c) n.c = joinBrokenWords(n.c)
        if ((n.t === 'lb' || n.t === 'pb' || n.t === 'cb') && n.a?.break === 'no') {
            if (typeof nodes[i - 1] === 'string') nodes[i - 1] = (nodes[i - 1] as string).trimEnd()
            if (typeof nodes[i + 1] === 'string') nodes[i + 1] = (nodes[i + 1] as string).trimStart()
        }
    }
    return nodes.filter((n) => n !== '')
}

const BLOCK_ELEMENTS = new Set(['div', 'ab', 'head', 'p'])
const isBlock = (n: TeiNode | undefined): n is Exclude<TeiNode, string> =>
    !!n && typeof n !== 'string' && BLOCK_ELEMENTS.has(n.t)
const isLb = (n: TeiNode | undefined): n is Exclude<TeiNode, string> => !!n && typeof n !== 'string' && n.t === 'lb'
const isBlank = (n: TeiNode) => typeof n === 'string' && !n.trim()

/**
 * Moves line breaks that sit between or at the end of blocks (div/ab/head) to
 * the start of the following block, so a line number is always rendered next
 * to the text of its line. Only affects presentation; text order is unchanged.
 */
export function hoistLineBreaks(nodes: TeiNode[]): TeiNode[] {
    // 1. children first; trailing lbs of a block move out behind the block
    const flat: TeiNode[] = []
    for (const n of nodes) {
        if (typeof n === 'string' || !n.c) {
            flat.push(n)
            continue
        }
        n.c = hoistLineBreaks(n.c)
        if (!isBlock(n)) {
            flat.push(n)
            continue
        }
        const trailing: TeiNode[] = []
        while (n.c.length && (isLb(n.c[n.c.length - 1]) || isBlank(n.c[n.c.length - 1]!))) {
            const last = n.c.pop()!
            if (isLb(last)) trailing.unshift(last)
        }
        flat.push(n, ...trailing)
    }
    // 2. an lb whose next non-blank sibling is a block moves into that block
    const out: TeiNode[] = []
    for (let i = 0; i < flat.length; i++) {
        const n = flat[i]!
        if (isLb(n)) {
            const next = flat.slice(i + 1).find((x) => !isBlank(x))
            if (isBlock(next)) {
                prependLb(next, n)
                continue
            }
        }
        out.push(n)
    }
    return out
}

function prependLb(block: Exclude<TeiNode, string>, lb: TeiNode) {
    const c = (block.c ??= [])
    const first = c.find((x) => !isBlank(x))
    // descend into nested blocks (div > ab) but keep a head's own first line
    if (isBlock(first) && block.t === 'div' && !c.slice(0, c.indexOf(first)).some(isLb)) return prependLb(first, lb)
    c.unshift(lb)
}
