<script setup lang="ts">
import type { Person, PersonNetwork } from "#shared/types"
import type { LiveNode, Rope } from "~/composables/useLiveLayout"

// Network around one person, up to `depth` steps away; one component for both diagrams:
// - "charters": a link is a shared charter or an explicit relation (the Charter Graph)
// - "relations": explicit relations only (the Relations Graph)
// Positions come from a live force simulation (d3-force): the person is fixed in the middle and everyone
// else is pushed outwards; only the lines hold them. Lines to the person (and from step 2 on to the person
// each one was reached from) are stiffer the more charters they share, so close persons stay near and
// weak ties drift out; relation lines are stiff and as long as their label, so a person with a single
// relation hangs beyond its partner instead of sitting near the centre. Line thickness = shared charters;
// accent lines = explicit relations. Rendered client-only (WebGL); sigma, graphology and d3-force are
// imported lazily so they stay out of SSR. Interaction: see usePersonSigma and useLiveLayout.
const props = defineProps<{
    id: string
    mode: "charters" | "relations"
    persons: Record<string, Person>
    depth: number
    /** person highlighted from outside (hover in the list) */
    highlight?: string
    /** person selected (click in the diagram) */
    selected?: string
    /** persons switched off: not shown and not followed to further steps */
    hidden: string[]
    /** charters mode: only follow explicit relations (persons that just share charters are left out) */
    hideUnrelated?: boolean
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
const layout = useLiveLayout<SimNode, SimLink>(
    () => `${props.mode === "relations" ? "relations" : "graph"}:${props.id}`,
)
/** follow explicit relations only */
const relationsOnly = computed(() => props.mode === "relations" || !!props.hideUnrelated)

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
                if (relationsOnly.value && !l.relations.length) continue
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

type SimNode = LiveNode
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
    // Drawing every co-occurrence would be a hairball: every charter is a clique. Relations mode: relations only.
    const pairs = new Map<string, [string, string]>()
    const related = (a: string, b: string) => !!adj.get(a)?.get(b)?.relations.length
    const addPair = (a: string, b: string) => {
        if (!relationsOnly.value || related(a, b)) pairs.set(a < b ? `${a} ${b}` : `${b} ${a}`, [a, b])
    }
    for (const b of adj.get(props.id)?.keys() ?? []) if (step.has(b)) addPair(props.id, b)
    for (const [c, p] of parent) if (step.get(c)! > 1) addPair(p, c)
    for (const a of step.keys())
        for (const [b, l] of adj.get(a) ?? []) if (step.has(b) && l.relations.length && a < b) addPair(a, b)
    const relationText = (a: string, b: string) =>
        [...new Set((adj.get(a)?.get(b)?.relations ?? []).map((r) => r.name))].join(", ")

    // a line is at least as long as its relation label needs
    const sizeOf = (s: number) => (s === 0 ? 14 : Math.max(4, 10 - 2 * s))
    const minLength = (a: string, b: string) => {
        const t = relationText(a, b)
        return sizeOf(step.get(a)!) + sizeOf(step.get(b)!) + (t ? textWidth(t, "relation") + 30 : 40)
    }
    const ring = 110

    // tie strength of a line by shared charters, 0 (one charter) … 1 (the most in this graph)
    const charters = (a: string, b: string) => adj.get(a)?.get(b)?.charters ?? 0
    const maxShared = Math.max(1, ...[...pairs.values()].map(([a, b]) => charters(a, b)))
    const tie = (a: string, b: string) =>
        maxShared > 1 ? Math.sqrt(Math.max(0, charters(a, b) - 1) / (maxShared - 1)) : 0

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
                radius: Math.max(sizeOf(s) + 8, textWidth(nameOf(n), "name") / 2 + 8),
            },
        ]),
    )
    simNodes.get(props.id)!.anchor = { x: 0, y: 0 }
    layout.applyPins(simNodes)
    // The centre person repels everyone (forceOutward) and everyone repels everyone (many-body, any distance);
    // only lines attract. Relation lines are springs, long enough for their label plus room. Charter lines are
    // ropes: they only pull when stretched beyond their length, which is shorter the more charters they stand for
    // (close persons stay near, weak ties drift out), and they never pull a person inwards that is held by a relation.
    const PUSH = 12
    const springs: SimLink[] = [...pairs.values()]
        .filter(([a, b]) => related(a, b))
        .map(([a, b]) => ({ source: a, target: b, distance: minLength(a, b) + 40, strength: 0.8 }))

    // Islands: persons joined by relations, not counting the centre person. An island hangs from one rope only
    // (from its anchor: a member related to the centre needs none; else the member nearest the centre with the
    // most relations), so its other members are free to move to the far side, away from everyone else.
    const islandOf = new Map<string, string[]>()
    for (const n of step.keys()) {
        if (n === props.id || islandOf.has(n)) continue
        const members: string[] = []
        const visit = (m: string) => {
            if (islandOf.has(m)) return
            islandOf.set(m, members)
            members.push(m)
            for (const [o, l] of adj.get(m) ?? [])
                if (o !== props.id && step.has(o) && l.relations.length && pairs.has(o < m ? `${o} ${m}` : `${m} ${o}`))
                    visit(o)
        }
        visit(n)
    }
    const degree = (n: string) => springs.filter((l) => l.source === n || l.target === n).length
    const anchorOf = new Map<string[], string | undefined>()
    for (const members of new Set(islandOf.values())) {
        if (members.length === 1) anchorOf.set(members, members[0])
        else if (members.some((m) => related(props.id, m))) anchorOf.set(members, undefined)
        else
            anchorOf.set(
                members,
                [...members].sort(
                    (a, b) =>
                        step.get(a)! - step.get(b)! ||
                        degree(b) - degree(a) ||
                        charters(parent.get(b)!, b) - charters(parent.get(a)!, a),
                )[0],
            )
    }
    // a charter line holds the person further out (the other end is the centre or the one it was reached from)
    const ropes: Rope<SimNode>[] = []
    for (const [a, b] of pairs.values()) {
        if (related(a, b)) continue
        const held = a === props.id || parent.get(b) === a ? b : a
        if (anchorOf.get(islandOf.get(held)!) !== held) continue
        ropes.push({
            a: simNodes.get(a === held ? b : a)!,
            b: simNodes.get(held)!,
            length: ring * (0.8 + 0.8 * (1 - tie(a, b))),
        })
    }
    const sim = d3
        .forceSimulation([...simNodes.values()])
        .force("out", forceOutward<SimNode>(PUSH))
        .force("collide", d3.forceCollide<SimNode>((n) => n.radius).iterations(3))
        .force("charge", d3.forceManyBody<SimNode>().strength(-80))
        .force(
            "link",
            d3
                .forceLink<SimNode, SimLink>(springs)
                .id((n) => n.id)
                .distance((l) => l.distance)
                .strength((l) => l.strength)
                .iterations(3),
        )
        .force("ropes", forceRope<SimNode>(ropes))
        .stop()
    // settle before showing (persons already shown barely move), then keep the simulation for dragging
    const changed = [...step.keys()].some((n) => !lastPos.has(n))
    sim.alpha(changed ? 1 : 0.3)
    sim.tick(300)
    const extent = (axis: "x" | "y") => Math.max(...[...simNodes.values()].map((p) => Math.abs(p[axis]))) + 40

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
watch(() => [props.id, props.mode, props.depth, props.hidden.join(), props.hideUnrelated], render)

onMounted(render)
onBeforeUnmount(() => renderId++)
</script>

<template>
    <div class="person-graph-wrap">
        <div ref="container" class="person-graph" />
        <PersonTips :tips="view.tips.value" />
    </div>
</template>
