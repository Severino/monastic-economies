<script setup lang="ts">
import type { Person } from "#shared/types"
import type { LiveNode } from "~/composables/useLiveLayout"
import type { RelationTree } from "~/composables/useRelationTree"

// Explicit relations only (charters ignored), drawn like a family tree: one row per generation,
// the active side of a directed relation above the passive side (arrow active -> passive), mutual
// relations side by side. Rows are ordered with a few barycentre sweeps, so related persons stand
// close to each other; that is the start of a live force layout (d3-force) which keeps the rows
// (a pull towards the row's height), gives every line the length its label needs and pushes persons
// without a relation between them apart. Rendered client-only (WebGL), see usePersonSigma and
// useLiveLayout for the interaction.
const props = defineProps<{
    id: string
    persons: Record<string, Person>
    tree: RelationTree
    /** person highlighted from outside (hover in the list) */
    highlight?: string
    /** person selected (click in the diagram) */
    selected?: string
}>()
const emit = defineEmits<{
    select: [id: string | undefined]
    open: [id: string]
    hover: [id: string | undefined]
}>()

const container = ref<HTMLElement>()
const view = usePersonSigma(container, {
    select: (id) => emit("select", id),
    open: (id) => emit("open", id),
    hover: (id) => emit("hover", id),
    drag: (id, phase) => live.drag(id, phase),
    unpin: (id) => live.unpin(id),
})
interface SimNode extends LiveNode {
    /** height of its row */
    row: number
}
interface SimLink {
    source: string | SimNode
    target: string | SimNode
    distance: number
}
const live = useLiveLayout<SimNode, SimLink>(() => `relations:${props.id}`)

/**
 * One line per pair of persons (a pair can have a mutual relation and directed ones both ways): all names on
 * one label, an arrow head at each passive end.
 */
function lines(tree: RelationTree) {
    const byPair = new Map<string, { a: string; b: string; names: string[]; head: boolean; tail: boolean }>()
    for (const l of tree.links) {
        const [a, b] = l.a < l.b ? [l.a, l.b] : [l.b, l.a]
        const key = `${a} ${b}`
        if (!byPair.has(key)) byPair.set(key, { a, b, names: [], head: false, tail: false })
        const e = byPair.get(key)!
        for (const n of l.names) if (!e.names.includes(n)) e.names.push(n)
        if (l.directed && l.b === b) e.head = true
        if (l.directed && l.b === a) e.tail = true
    }
    return [...byPair.values()]
}

/** Column and row distance in graph units (= pixels while the tree fits); persons side by side with a relation
 * stand as far apart as their label needs, rows as far as the longest label between rows. */
const COL = 130
let ROW = 110

function layout(tree: RelationTree) {
    // lines within a row carry their label horizontally (column distance), lines between rows mostly
    // vertically (row distance)
    const lv = new Map(tree.levels.map((l) => [l.id, l.level]))
    const all = lines(tree)
    const label = new Map(all.map((e) => [`${e.a} ${e.b}`, textWidth(e.names.join(", "), "relation")]))
    const gap = (n: string, m: string) => Math.max(COL, (label.get(n < m ? `${n} ${m}` : `${m} ${n}`) ?? 0) + 60)
    ROW = Math.max(110, ...all.filter((e) => lv.get(e.a) !== lv.get(e.b)).map((e) => label.get(`${e.a} ${e.b}`)! + 50))
    const rows = new Map<number, string[]>()
    for (const { id, level } of tree.levels) {
        if (!rows.has(level)) rows.set(level, [])
        rows.get(level)!.push(id)
    }
    const levels = [...rows.keys()].sort((a, b) => a - b)
    const neighbours = new Map<string, string[]>()
    for (const l of tree.links) {
        neighbours.set(l.a, [...(neighbours.get(l.a) ?? []), l.b])
        neighbours.set(l.b, [...(neighbours.get(l.b) ?? []), l.a])
    }
    const x = new Map<string, number>()
    for (const row of rows.values()) row.forEach((n, i) => x.set(n, (i - (row.length - 1) / 2) * COL))

    // persons in one row joined by relations (siblings, spouses) form a block that stays together,
    // ordered along the chain of relations (sibling – person – spouse), so no line runs through a third person
    const level = new Map(tree.levels.map((l) => [l.id, l.level]))
    const sameRow = (n: string) => (neighbours.get(n) ?? []).filter((m) => level.get(m) === level.get(n))
    const blocks = new Map<number, string[][]>()
    for (const [lv, row] of rows) {
        const seen = new Set<string>()
        const list: string[][] = []
        for (const start of row) {
            if (seen.has(start)) continue
            // walk from one end of the chain (a member with at most one partner in the row)
            const members: string[] = []
            const collect = (n: string) => {
                if (seen.has(n)) return
                seen.add(n)
                members.push(n)
                sameRow(n).forEach(collect)
            }
            collect(start)
            const end = members.find((n) => sameRow(n).length <= 1) ?? members[0]!
            const chain: string[] = []
            const walk = (n: string) => {
                if (chain.includes(n)) return
                chain.push(n)
                sameRow(n).forEach(walk)
            }
            walk(end)
            list.push(chain)
        }
        blocks.set(lv, list)
    }

    // barycentre sweeps, alternately top-down and bottom-up: each block wants to stand at the mean
    // position of the persons in other rows its members are related to; then the row is packed left to
    // right with at least one column between persons and shifted back so it does not drift
    for (let sweep = 0; sweep < 8; sweep++) {
        for (const lv of sweep % 2 ? [...levels].reverse() : levels) {
            const list = blocks.get(lv)!
            const want = (b: string[]) => {
                const ns = b.flatMap((n) => (neighbours.get(n) ?? []).filter((m) => level.get(m) !== lv))
                const centre = b.reduce((s, n) => s + x.get(n)!, 0) / b.length
                return ns.length ? ns.reduce((s, m) => s + x.get(m)!, 0) / ns.length : centre
            }
            const wants = new Map(list.map((b) => [b, want(b)]))
            // a chain reads in the direction that puts its outer ends nearer their own relations
            for (const b of list) {
                const side = (n: string) => {
                    const ns = (neighbours.get(n) ?? []).filter((m) => level.get(m) !== lv)
                    return ns.length ? ns.reduce((s, m) => s + x.get(m)!, 0) / ns.length : wants.get(b)!
                }
                if (b.length > 1 && side(b[0]!) > side(b[b.length - 1]!)) b.reverse()
            }
            list.sort((a, b) => wants.get(a)! - wants.get(b)!)
            let prev = -Infinity
            let shift = 0
            for (const b of list) {
                const offsets = b.map((_, i) => b.slice(0, i).reduce((d, n, j) => d + gap(n, b[j + 1]!), 0))
                const width = offsets[offsets.length - 1]!
                const left = Math.max(wants.get(b)! - width / 2, prev + COL)
                b.forEach((n, i) => x.set(n, left + offsets[i]!))
                prev = left + width
                shift += wants.get(b)! - (left + width / 2)
            }
            for (const b of list) for (const n of b) x.set(n, x.get(n)! + shift / list.length)
        }
    }
    // the centre person at x = 0
    const dx = x.get(props.id) ?? 0
    return new Map(tree.levels.map(({ id, level }) => [id, { x: x.get(id)! - dx, y: -level * ROW }]))
}

let renderId = 0
async function render() {
    if (!container.value || !props.tree.levels.length) return
    const id = ++renderId
    const [{ default: Graph }, d3] = await Promise.all([import("graphology"), import("d3-force")])
    if (id !== renderId) return
    const pos = layout(props.tree)
    const all = lines(props.tree)
    const sizeOf = (n: string) => (n === props.id ? 12 : 8)
    live.stop()
    const nodes = new Map<string, SimNode>(
        [...pos].map(([n, p]) => [
            n,
            {
                id: n,
                ...p,
                row: p.y,
                radius: Math.max(sizeOf(n) + 8, textWidth(props.persons[n]?.name ?? n, "name") / 2 + 8),
            },
        ]),
    )
    nodes.get(props.id)!.anchor = { ...pos.get(props.id)! }
    live.applyPins(nodes)
    const linked = new Set(all.map((e) => `${e.a} ${e.b}`))
    const links: SimLink[] = all.map((e) => ({
        source: e.a,
        target: e.b,
        // long enough for the label between the two circles
        distance: sizeOf(e.a) + sizeOf(e.b) + textWidth(e.names.join(", "), "relation") + 40,
    }))
    const sim = d3
        .forceSimulation([...nodes.values()])
        .force("row", d3.forceY<SimNode>((n) => n.row).strength(0.3))
        .force("x", d3.forceX<SimNode>(0).strength(0.01))
        .force("collide", d3.forceCollide<SimNode>((n) => n.radius).iterations(3))
        .force("charge", d3.forceManyBody<SimNode>().strength(-60).distanceMax(250))
        .force(
            "apart",
            forceApart<SimNode>((a, b) => !linked.has(a < b ? `${a} ${b}` : `${b} ${a}`), 40, 0.5),
        )
        .force(
            "link",
            d3
                .forceLink<SimNode, SimLink>(links)
                .id((n) => n.id)
                .distance((l) => l.distance)
                .strength(0.5),
        )
        .stop()
    // the tree layout is a good start: settle gently
    sim.alpha(0.5)
    sim.tick(200)

    const graph = new Graph()
    for (const [n, p] of nodes)
        graph.addNode(n, { x: p.x, y: p.y, size: sizeOf(n), ...personNode(props.persons[n], n, n === props.id) })
    for (const e of all)
        graph.addEdge(e.a, e.b, {
            size: 2,
            explicit: true,
            relations: e.names.join(", "),
            head: e.head ? "arrow" : "none",
            tail: e.tail ? "arrow" : "none",
        })
    live.attach(sim, nodes, graph)
    // frame: the whole tree (at least the pane, so units stay pixels and labels fit their lines)
    const xs = [...nodes.values()].map((p) => p.x)
    const ys = [...nodes.values()].map((p) => p.y)
    await view.mount(graph, {
        x: [Math.min(...xs) - COL / 2, Math.max(...xs) + COL / 2],
        y: [Math.min(...ys) - ROW / 2, Math.max(...ys) + ROW / 2],
    })
    view.setListHighlight(props.highlight)
    view.setSelected(props.selected)
}

watch(
    () => props.highlight,
    (h) => view.setListHighlight(h),
)
watch(
    () => props.selected,
    (s) => view.setSelected(s),
)
watch(() => [props.id, props.tree], render)

onMounted(render)
onBeforeUnmount(() => renderId++)
</script>

<template>
    <div class="person-graph-wrap">
        <div ref="container" class="person-graph" />
        <PersonTips :tips="view.tips.value" />
    </div>
</template>
