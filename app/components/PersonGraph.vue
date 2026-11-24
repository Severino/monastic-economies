<script setup lang="ts">
import type { Person, PersonNetwork } from "#shared/types"

// Network around one person, up to `depth` steps away. Positions come from a force simulation
// (d3-force): each step is a ring, and within its ring a person sits nearer the centre the more
// charters it shares with the person it was reached from. Line thickness = number of shared
// charters; accent lines = explicit relations. Rendered client-only (WebGL); sigma, graphology
// and d3-force are imported lazily so they stay out of SSR. Interaction: see usePersonSigma.
const props = defineProps<{
    id: string
    persons: Record<string, Person>
    depth: number
    /** person highlighted from outside (hover in the list) */
    highlight?: string
    /** person selected (click in the diagram) */
    selected?: string
    /** persons switched off: not shown and not followed to further steps */
    hidden: string[]
    /** only follow explicit relations (persons that just share charters are left out) */
    hideUnrelated: boolean
}>()
const emit = defineEmits<{
    /** click: select (undefined = clear) */
    select: [id: string | undefined]
    /** ctrl/cmd-click: open that person */
    open: [id: string]
    /** alt-click: switch a person off */
    hide: [id: string]
    hover: [id: string | undefined]
    /** number of persons per step: [1 step, 2 steps, …] */
    stats: [counts: number[]]
}>()

const container = ref<HTMLElement>()
const view = usePersonSigma(container, {
    select: (id) => emit("select", id),
    open: (id) => emit("open", id),
    hide: (id) => {
        if (id !== props.id) emit("hide", id)
    },
    hover: (id) => emit("hover", id),
})

// ---- network (fetched once per visit) --------------------------------------------
interface Link {
    charters: number
    /** explicit relations, seen from the first person of the pair */
    relations: { name: string; dir: "out" | "in" | "mutual" }[]
}
let network: Promise<Map<string, Map<string, Link>>> | undefined
function loadNetwork() {
    network ??= $fetch<PersonNetwork>("/data/network.json").then((net) => {
        const adj = new Map<string, Map<string, Link>>()
        const link = (a: string, b: string) => {
            if (!adj.has(a)) adj.set(a, new Map())
            const m = adj.get(a)!
            if (!m.has(b)) m.set(b, { charters: 0, relations: [] })
            return m.get(b)!
        }
        for (const [a, b, n] of net.edges) link(a, b).charters = link(b, a).charters = n
        for (const [a, b, name, directed] of net.relations) {
            link(a, b).relations.push({ name: label(name), dir: directed ? "out" : "mutual" })
            link(b, a).relations.push({ name: label(name), dir: directed ? "in" : "mutual" })
        }
        return adj
    })
    return network
}

const nameOf = (id: string) => props.persons[id]?.name ?? id

/** Breadth-first search from the centre; parent = strongest link from the previous step. */
function explore(adj: Map<string, Map<string, Link>>) {
    const off = new Set(props.hidden)
    const step = new Map([[props.id, 0]])
    const parent = new Map<string, string>()
    let frontier = [props.id]
    for (let d = 1; d <= props.depth && frontier.length; d++) {
        const next: string[] = []
        for (const from of frontier)
            for (const [to, l] of adj.get(from) ?? []) {
                if (off.has(to) || (step.has(to) && step.get(to)! < d)) continue
                if (props.hideUnrelated && !l.relations.length) continue
                const best = parent.get(to)
                if (!step.has(to)) {
                    step.set(to, d)
                    next.push(to)
                }
                if (!best || adj.get(best)!.get(to)!.charters < l.charters) parent.set(to, from)
            }
        frontier = next.sort()
    }
    return { step, parent }
}

/** Distance between two rings, in graph units. */
const RING = 100

/**
 * Start positions: radial tree (ring = step, each subtree gets a sector proportional to the square
 * root of its number of leaves). The force simulation starts from here, so subtrees stay together.
 */
function radialTree(step: Map<string, number>, parent: Map<string, string>) {
    const children = new Map<string, string[]>()
    for (const [c, p] of parent) {
        if (!children.has(p)) children.set(p, [])
        children.get(p)!.push(c)
    }
    const leaves = new Map<string, number>()
    const count = (n: string): number => {
        const k = children.get(n)?.reduce((s, c) => s + count(c), 0) || 1
        leaves.set(n, k)
        return k
    }
    count(props.id)
    const pos = new Map<string, { x: number; y: number }>([[props.id, { x: 0, y: 0 }]])
    const weight = (n: string) => Math.sqrt(leaves.get(n)!)
    const place = (n: string, from: number, to: number) => {
        let a = from
        const kids = (children.get(n) ?? []).sort(
            (x, y) => leaves.get(y)! - leaves.get(x)! || nameOf(x).localeCompare(nameOf(y)),
        )
        const total = kids.reduce((t, c) => t + weight(c), 0)
        for (const c of kids) {
            const span = ((to - from) * weight(c)) / total
            const angle = a + span / 2 - Math.PI / 2
            const r = step.get(c)! * RING
            pos.set(c, { x: r * Math.cos(angle), y: r * Math.sin(angle) })
            place(c, a, a + span)
            a += span
        }
    }
    place(props.id, 0, 2 * Math.PI)
    return pos
}

interface SimNode {
    id: string
    x: number
    y: number
    fx?: number
    fy?: number
    /** target distance from the centre */
    r: number
}

/**
 * Force layout (d3-force): a radial force pulls every person to its target distance from the centre,
 * collision keeps circles and labels apart, a weak link to the parent keeps subtrees in their sector.
 * Target distance: ring of its step, pulled inwards by the number of charters shared with the person
 * it was reached from (most shared charters in this graph: 45 % nearer than the ring).
 */
async function forceLayout(step: Map<string, number>, parent: Map<string, string>, strength: (c: string) => number) {
    const { forceSimulation, forceRadial, forceCollide, forceLink, forceManyBody } = await import("d3-force")
    const start = radialTree(step, parent)
    const max = Math.max(1, ...[...parent.keys()].map(strength))
    const pull = (c: string) => (max > 1 ? Math.sqrt(Math.max(0, strength(c) - 1) / (max - 1)) : 0)
    const nodes: SimNode[] = [...step].map(([id, s]) => ({
        id,
        ...start.get(id)!,
        r: s === 0 ? 0 : (s - 0.45 * pull(id)) * RING,
    }))
    nodes[0]!.fx = 0
    nodes[0]!.fy = 0
    const links = [...parent].map(([c, p]) => ({ source: p, target: c }))
    const sim = forceSimulation(nodes)
        .force("radial", forceRadial<SimNode>((n) => n.r).strength(0.8))
        .force("collide", forceCollide<SimNode>(RING * 0.16).iterations(2))
        .force(
            "charge",
            forceManyBody<SimNode>()
                .strength(-RING * 0.4)
                .distanceMax(RING * 1.2),
        )
        .force(
            "link",
            forceLink<SimNode, { source: string; target: string }>(links)
                .id((n) => n.id)
                .distance(RING)
                .strength(0.05),
        )
        .stop()
    sim.tick(300)
    return new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]))
}

let renderId = 0
async function render() {
    if (!container.value) return
    const id = ++renderId
    const [{ default: Graph }, adj] = await Promise.all([import("graphology"), loadNetwork()])
    const { step, parent } = explore(adj)
    const shared = (c: string) => adj.get(parent.get(c)!)?.get(c)?.charters ?? 0
    const pos = await forceLayout(step, parent, shared)
    if (id !== renderId || !container.value) return // a newer render started meanwhile

    const counts = Array.from({ length: props.depth }, (_, i) => [...step.values()].filter((s) => s === i + 1).length)
    emit("stats", counts)

    const graph = new Graph()
    for (const [n, s] of step)
        graph.addNode(n, {
            ...pos.get(n)!,
            // graph y grows downwards in the layout, upwards in sigma
            y: -pos.get(n)!.y,
            size: s === 0 ? 14 : Math.max(4, 10 - 2 * s),
            ...personNode(props.persons[n], n, s === 0),
        })
    // Links drawn: every link of the centre person, and from step 2 on the link to the person each one was
    // reached from. Co-occurrence makes every charter a clique, so drawing all links between shown persons
    // turns into a hairball as soon as there is more than one step.
    const links: [string, string][] = [
        ...[...(adj.get(props.id)?.keys() ?? [])]
            .filter((b) => step.has(b))
            .map((b): [string, string] => [props.id, b]),
        ...[...parent].filter(([c]) => step.get(c)! > 1).map(([c, p]): [string, string] => [p, c]),
    ]
    const max = Math.max(1, ...links.map(([a, b]) => adj.get(a)!.get(b)!.charters))
    for (const [a, b] of links) {
        const l = adj.get(a)!.get(b)!
        // directed relations as arrow heads (active -> passive), both ends when they go both ways
        const out = l.relations.some((r) => r.dir === "out")
        const inn = l.relations.some((r) => r.dir === "in")
        const [source, target] = inn && !out ? [b, a] : [a, b]
        graph.addEdge(source, target, {
            head: out || inn ? "arrow" : "none",
            tail: out && inn ? "arrow" : "none",
            // thickness by shared charters (square root, so a few strong ties don't dwarf the rest)
            // (explicit relations at least 2 px, so their arrow heads stay visible)
            size: Math.max(
                l.relations.length ? 2 : 1,
                l.charters ? 1 + 5 * Math.sqrt((l.charters - 1) / Math.max(1, max - 1)) : 1,
            ),
            explicit: l.relations.length > 0,
            relations: [...new Set(l.relations.map((r) => r.name))].join(", "),
        })
    }

    // frame: centre person in the middle, and at least one ring around it (a graph of two persons
    // would otherwise be stretched over the whole pane)
    const reach = Math.max(RING, ...[...pos.values()].map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) + RING * 0.15
    await view.mount(graph, { x: [-reach, reach], y: [-reach, reach] })
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
watch(() => [props.id, props.depth, props.hidden.join(), props.hideUnrelated], render)

onMounted(render)
onBeforeUnmount(() => renderId++)
</script>

<template>
    <div class="person-graph-wrap">
        <div ref="container" class="person-graph" />
        <PersonTips :tips="view.tips.value" />
    </div>
</template>
