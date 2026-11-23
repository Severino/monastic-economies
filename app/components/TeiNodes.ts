/**
 * Renders the compact TEI tree (see shared/types TeiNode).
 *
 * Context is injected by <TeiText>:
 *  - kinds:   ref -> 'person' | 'place' | 'org' | 'unresolved'
 *  - notes:   footnote ids in display order
 *  - lines:   true = diplomatic line breaks, false = running text
 */
import { defineComponent, h, inject, type InjectionKey, type PropType, type VNodeChild } from 'vue'
import { NuxtLink } from '#components'
import type { EntityKind, TeiNode } from '#shared/types'

export interface TeiContext {
    kinds: Record<string, EntityKind>
    notes: string[]
    lines: boolean
}
export const TEI_CONTEXT: InjectionKey<TeiContext> = Symbol('tei')

const ROUTES: Partial<Record<EntityKind, string>> = { person: '/persons/', place: '/places/' }

const BLOCKS = new Set(['div', 'ab', 'head', 'p'])
/** true if the lb sits between block elements or ends its parent (ignoring whitespace). */
function isBlockLevel(siblings: TeiNode[], i: number) {
    const next = siblings.slice(i + 1).find((n) => typeof n !== 'string' || n.trim())
    if (!next) return true
    return typeof next !== 'string' && BLOCKS.has(next.t)
}

/** true if nothing but whitespace precedes the node in its parent. */
const isFirst = (siblings: TeiNode[], i: number) =>
    siblings.slice(0, i).every((n) => typeof n === 'string' && !n.trim())

/** true if the closest preceding non-whitespace sibling is a page break. */
function followsPb(siblings: TeiNode[], i: number) {
    for (let j = i - 1; j >= 0; j--) {
        const n = siblings[j]
        if (typeof n === 'string') {
            if (n.trim()) return false
            continue
        }
        return n.t === 'pb'
    }
    return false
}

const TeiNodes = defineComponent({
    name: 'TeiNodes',
    props: {
        nodes: { type: Array as PropType<TeiNode[]>, required: true },
        block: { type: Boolean, default: false }, // rendered directly inside div/ab/head
    },
    setup(props) {
        const ctx = inject(TEI_CONTEXT, { kinds: {}, notes: [], lines: true })
        const kids = (n: Exclude<TeiNode, string>) => (n.c ? h(TeiNodes, { nodes: n.c, block: BLOCKS.has(n.t) }) : null)

        function render(n: TeiNode, i = 0, siblings: TeiNode[] = []): VNodeChild {
            if (typeof n === 'string') return n
            const a = n.a ?? {}
            switch (n.t) {
                case 'lb':
                    if (!ctx.lines) return a.break === 'no' ? null : ' '
                    // between blocks (or at the end of one) a <br> would create empty lines:
                    // only show the line number next to whatever follows
                    // a block or page break already starts a new line: only the number
                    if (props.block && isFirst(siblings, i))
                        return a.n ? h('span', { class: 'tei-lineno', 'aria-hidden': 'true' }, a.n) : null
                    if (isBlockLevel(siblings, i) || followsPb(siblings, i))
                        return a.n
                            ? h(
                                  'span',
                                  { class: 'tei-lb-marker', 'aria-hidden': 'true' },
                                  h('span', { class: 'tei-lineno' }, a.n),
                              )
                            : null
                    return [
                        a.break === 'no' ? h('span', { class: 'tei-hyphen', 'aria-hidden': 'true' }, '-') : null,
                        h('br', { class: 'tei-lb' }),
                        a.n ? h('span', { class: 'tei-lineno', 'aria-hidden': 'true' }, a.n) : null,
                    ]
                case 'pb':
                    // rendered as its own line (display: block); clicking selects the facsimile page
                    return h(
                        'span',
                        {
                            class: 'tei-pb',
                            'data-page': a.n,
                            role: 'button',
                            tabindex: 0,
                            title: `Show page ${a.n ?? ''}`,
                        },
                        `fol. ${a.n ?? '?'}`,
                    )
                case 'cb':
                    return h('span', { class: 'tei-cb' }, '‖')
                case 'head':
                    return h('div', { class: ['tei-head', a.rend && `rend-${a.rend}`] }, kids(n))
                case 'div':
                    return h('section', { class: 'tei-div', 'data-type': a.type }, kids(n))
                case 'ab':
                    return h('div', { class: 'tei-ab', 'data-type': a.type, title: a.type }, kids(n))
                case 'hi':
                    return h('span', { class: `rend-${a.rend}` }, kids(n))
                case 'del':
                    return h('del', { class: 'tei-del', title: a.hand ? `deleted (${a.hand})` : 'deleted' }, kids(n))
                case 'add':
                    return h('ins', { class: 'tei-add', title: a.hand ? `added (${a.hand})` : 'added' }, kids(n))
                case 'supplied':
                    return h('span', { class: 'tei-supplied', title: 'supplied by the editors' }, ['[', kids(n), ']'])
                case 'sic':
                    return h('span', { class: 'tei-sic' }, [kids(n), ' (!)'])
                case 'date':
                    return h('time', { class: 'tei-date', datetime: a.when }, kids(n))
                case 'choice':
                    // parallel encodings: show the first one
                    return n.c?.[0] ? render(n.c[0]) : null
                case 'metamark':
                    return h('span', { class: 'tei-metamark' }, kids(n))
                case 'rs':
                    return renderRs(n)
                default:
                    return h('span', { class: `tei-${n.t}` }, kids(n))
            }
        }

        function renderRs(n: Exclude<TeiNode, string>): VNodeChild {
            const a = n.a ?? {}
            let inner: VNodeChild = kids(n)

            // entity reference
            const ref = a.ref?.split(/\s+/)[0]
            if (ref) {
                const kind = ctx.kinds[ref] ?? 'unresolved'
                const cls = ['tei-entity', `tei-${kind}`]
                const title = [kind, a.role].filter(Boolean).join(' · ')
                const route = ROUTES[kind]
                const content = inner // capture: `inner` is reassigned below
                inner = route
                    ? h(NuxtLink, { to: route + ref, class: cls, title, 'data-role': a.role }, () => content)
                    : h('span', { class: cls, title, 'data-role': a.role }, content)
            }
            // legal action / measurement
            if (a.type) inner = h('span', { class: 'tei-action', 'data-types': a.type, title: a.type }, inner)

            // footnote anchor
            const id = a['xml:id']
            const idx = id ? ctx.notes.indexOf(id) : -1
            if (idx >= 0)
                inner = [
                    h('span', { id: `anchor-${id}`, class: 'tei-noted' }, inner),
                    h('sup', { class: 'tei-noteref' }, h('a', { href: `#note-${id}` }, String(idx + 1))),
                ]
            return inner
        }

        return () => props.nodes.map((n, i) => render(n, i, props.nodes))
    },
})

export default TeiNodes
