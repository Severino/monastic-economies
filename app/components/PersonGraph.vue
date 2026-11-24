<script setup lang="ts">
import type { Person, PersonNetwork } from "#shared/types"
import type { LiveNode } from "~/composables/useLiveLayout"

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
    drag: (id, phase) => layout.drag(id, phase),
    unpin: (id) => layout.unpin(id),
})
// live layout; dragged persons stay pinned (per centre person, remembered in localStorage)
const layout = useLiveLayout<SimNode, SimLink>(() => `graph:${props.id}`)

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

/**
 * Start positions: radial tree (ring = step, each subtree gets a sector proportional to the square
 * root of its number of leaves). New persons start here; persons already shown keep their place.
 */
function radialTree(step: Map<string, number>, parent: Map<string, string>, ring: number) {
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
            const r = step.get(c)! * ring
            pos.set(c, { x: r * Math.cos(angle), y: r * Math.sin(angle) })
            place(c, a, a + span)
            a += span
        }
    }
    place(props.id, 0, 2 * Math.PI)
    return pos
}

interface SimNode extends LiveNode {
    /** target distance from the centre */
    r: number
}
interface SimLink {
    source: string | SimNode
    target: string | SimNode
    distance: number
    strength: number
}

// ---- live force simulation (d3-force), graph units = pixels while the graph fits the pane ----------
// It keeps running while a person is dragged, so the others make room; when persons are hidden or the
// depth changes, everyone already shown starts where they were and the rest settles around them.
let simNodes = new Map<string, SimNode>()
/** last positions, kept across re-renders of the same centre person */
let lastPos = new Map<string, { x: number; y: number }>()
let lastCentre = ""

let renderId = 0
async function render() {
    if (!container.value) return
    const id = ++renderId
    const [{ default: Graph }, adj, d3] = await Promise.all([import("graphology"), loadNetwork(), import("d3-force")])
    if (id !== renderId || !container.value) return // a newer render started meanwhile
    const { step, parent } = explore(adj)

    const counts = Array.from({ length: props.depth }, (_, i) => [...step.values()].filter((s) => s === i + 1).length)
    emit("stats", counts)

    // Lines drawn: every link of the centre person, from step 2 on the link to the person each one was
    // reached from, and explicit relations between any two persons shown (so related persons form islands).
    // Drawing every co-occurrence would be a hairball: every charter is a clique.
    const pairs = new Map<string, [string, string]>()
    const addPair = (a: string, b: string) => pairs.set(a < b ? `${a} ${b}` : `${b} ${a}`, [a, b])
    for (const b of adj.get(props.id)?.keys() ?? []) if (step.has(b)) addPair(props.id, b)
    for (const [c, p] of parent) if (step.get(c)! > 1) addPair(p, c)
    for (const a of step.keys())
        for (const [b, l] of adj.get(a) ?? []) if (step.has(b) && l.relations.length && a < b) addPair(a, b)
    const relationText = (a: string, b: string) =>
        [...new Set((adj.get(a)?.get(b)?.relations ?? []).map((r) => r.name))].join(", ")
    const related = (a: string, b: string) => !!adj.get(a)?.get(b)?.relations.length

    // ring distance; a line with a relation label is at least as long as the label needs
    const sizeOf = (s: number) => (s === 0 ? 14 : Math.max(4, 10 - 2 * s))
    const minLength = (a: string, b: string) => {
        const t = relationText(a, b)
        return sizeOf(step.get(a)!) + sizeOf(step.get(b)!) + (t ? textWidth(t, "relation") + 30 : 40)
    }
    const ring = 130

    // target distance from the centre: ring of its step, pulled inwards by the charters shared with the person
    // it was reached from (the most shared charters in this graph: 40 % nearer), never shorter than its label
    const shared = (c: string) => adj.get(parent.get(c)!)?.get(c)?.charters ?? 0
    const max = Math.max(1, ...[...parent.keys()].map(shared))
    const pull = (c: string) => (max > 1 ? Math.sqrt(Math.max(0, shared(c) - 1) / (max - 1)) : 0)
    const target = (c: string, s: number) =>
        s === 0 ? 0 : Math.max((s - 0.4 * pull(c)) * ring, s === 1 ? minLength(props.id, c) : 0)
    // persons with explicit relations to others shown (not the centre) form islands: they sit further out,
    // held only loosely by the radial force, so their relation lines can arrange them
    const inIsland = new Set(
        [...pairs.values()].filter(([a, b]) => a !== props.id && b !== props.id && relationText(a, b)).flat(),
    )

    if (lastCentre !== props.id) lastPos = new Map()
    lastCentre = props.id
    const start = radialTree(step, parent, ring)
    layout.stop()
    simNodes = new Map(
        [...step].map(([n, s]) => [
            n,
            {
                id: n,
                ...(lastPos.get(n) ?? start.get(n)!),
                r: inIsland.has(n) ? Math.max(target(n, s), (s + 0.6) * ring) : target(n, s),
                radius: Math.max(sizeOf(s) + 8, textWidth(nameOf(n), "name") / 2 + 8),
            },
        ]),
    )
    simNodes.get(props.id)!.anchor = { x: 0, y: 0 }
    layout.applyPins(simNodes)
    const links: SimLink[] = [...pairs.values()].map(([a, b]) => {
        const related = !!relationText(a, b)
        const fromCentre = a === props.id || b === props.id
        return {
            source: a,
            target: b,
            // lines from the centre follow the radial target; other relations pull their persons together
            distance: fromCentre ? target(a === props.id ? b : a, 1) : minLength(a, b),
            strength: related ? (fromCentre ? 0.3 : 1) : fromCentre ? 0.02 : 0.08,
        }
    })
    const sim = d3
        .forceSimulation([...simNodes.values()])
        .force(
            "radial",
            d3.forceRadial<SimNode>((n) => n.r).strength((n) => (inIsland.has(n.id) ? 0.04 : 0.3)),
        )
        .force("collide", d3.forceCollide<SimNode>((n) => n.radius).iterations(3))
        .force("charge", d3.forceManyBody<SimNode>().strength(-120).distanceMax(300))
        // persons in islands keep clear of everyone they have no relation with
        .force(
            "apart",
            forceApart<SimNode>(
                (a, b) => a !== props.id && b !== props.id && (inIsland.has(a) || inIsland.has(b)) && !related(a, b),
                40,
                0.5,
            ),
        )
        .force(
            "link",
            d3
                .forceLink<SimNode, SimLink>(links)
                .id((n) => n.id)
                .distance((l) => l.distance)
                .strength((l) => l.strength)
                .iterations(3),
        )
        .stop()
    // settle before showing (persons already shown barely move), then keep the simulation for dragging
    const changed = [...step.keys()].some((n) => !lastPos.has(n))
    sim.alpha(changed ? 1 : 0.3)
    sim.tick(300)
    // A graph bigger than the pane is shown zoomed out, which shortens the lines but not their labels.
    // So once more with the relation lines between other persons lengthened by that zoom factor.
    const extent = (axis: "x" | "y") => Math.max(...[...simNodes.values()].map((p) => Math.abs(p[axis]))) + 40
    const f = Math.min(
        1,
        (container.value.clientWidth - 100) / 2 / extent("x"),
        (container.value.clientHeight - 100) / 2 / extent("y"),
    )
    if (f < 0.98) {
        for (const l of links) if (l.strength === 1) l.distance /= f
        sim.force<import("d3-force").ForceLink<SimNode, SimLink>>("link")!.links(links)
        sim.alpha(0.5)
        sim.tick(200)
    }

    const graph = new Graph()
    for (const [n, s] of step)
        graph.addNode(n, {
            x: simNodes.get(n)!.x,
            y: simNodes.get(n)!.y,
            size: sizeOf(s),
            ...personNode(props.persons[n], n, s === 0),
        })
    const maxCharters = Math.max(1, ...[...pairs.values()].map(([a, b]) => adj.get(a)!.get(b)!.charters))
    for (const [a, b] of pairs.values()) {
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
                l.charters ? 1 + 5 * Math.sqrt((l.charters - 1) / Math.max(1, maxCharters - 1)) : 1,
            ),
            explicit: l.relations.length > 0,
            relations: relationText(a, b),
        })
    }
    layout.attach(sim, simNodes, graph, () => {
        for (const [n, p] of simNodes) lastPos.set(n, { x: p.x, y: p.y })
    })
    for (const [n, p] of simNodes) lastPos.set(n, { x: p.x, y: p.y })

    // frame: centre person in the middle, the whole graph (at least the pane, so units stay pixels)
    const [rx, ry] = [extent("x"), extent("y")]
    await view.mount(graph, { x: [-rx, rx], y: [-ry, ry] })
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
