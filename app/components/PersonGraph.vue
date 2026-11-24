<script setup lang="ts">
import type Sigma from "sigma"
import type { Person, PersonNetwork } from "#shared/types"

// Network around one person, up to `depth` steps away. Positions come from a force simulation
// (d3-force): each step is a ring, and within its ring a person sits nearer the centre the more
// charters it shares with the person it was reached from. Line thickness = number of shared
// charters; accent lines = explicit relations. Rendered client-only (WebGL); sigma, graphology
// and d3-force are imported lazily so they stay out of SSR.
const props = defineProps<{
    id: string
    persons: Record<string, Person>
    depth: number
    /** person highlighted from outside (hover in the list) */
    highlight?: string
    /** persons switched off: not shown and not followed to further steps */
    hidden: string[]
    /** only follow explicit relations (persons that just share charters are left out) */
    hideUnrelated: boolean
}>()
const emit = defineEmits<{
    /** click: open that person (newTab: ctrl/cmd-click) */
    select: [id: string, newTab: boolean]
    /** alt-click: switch a person off */
    hide: [id: string]
    hover: [id: string | undefined]
    /** number of persons per step: [1 step, 2 steps, …] */
    stats: [counts: number[]]
}>()

const container = ref<HTMLElement>()
let sigma: Sigma | undefined
let observer: MutationObserver | undefined
let media: MediaQueryList | undefined

// colours come from the CSS tokens, re-read when the theme changes
const palette = {
    text: "",
    muted: "",
    border: "",
    accent: "",
    surface: "",
    male: "",
    female: "",
    "sex-unknown": "",
}
function readPalette() {
    const s = getComputedStyle(document.documentElement)
    for (const k of Object.keys(palette) as (keyof typeof palette)[]) palette[k] = s.getPropertyValue(`--${k}`).trim()
}

// ---- tooltip (name, alternate spellings) ---------------------------------------------
const tip = ref<{ id: string; x: number; y: number }>()
const tipPerson = computed(() => (tip.value ? props.persons[tip.value.id] : undefined))

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

const plural = (n: number) => `${n} shared charter${n === 1 ? "" : "s"}`

let renderId = 0
async function render() {
    if (!container.value) return
    const id = ++renderId
    const [{ default: Graph }, { default: SigmaCtor }, adj, { pathLine, extremityArrow }] = await Promise.all([
        import("graphology"),
        import("sigma"),
        loadNetwork(),
        import("sigma/rendering"),
    ])
    const { step, parent } = explore(adj)
    const shared = (c: string) => adj.get(parent.get(c)!)?.get(c)?.charters ?? 0
    const pos = await forceLayout(step, parent, shared)
    if (id !== renderId || !container.value) return // a newer render started meanwhile
    sigma?.kill()
    tip.value = undefined
    readPalette()

    const counts = Array.from({ length: props.depth }, (_, i) => [...step.values()].filter((s) => s === i + 1).length)
    emit("stats", counts)

    const graph = new Graph()
    for (const [n, s] of step)
        graph.addNode(n, {
            ...pos.get(n)!,
            // graph y grows downwards in the layout, upwards in sigma
            y: -pos.get(n)!.y,
            size: s === 0 ? 14 : Math.max(4, 10 - 2 * s),
            label: nameOf(n),
            step: s,
            sex: sexOf(props.persons[n]?.sex) ?? "",
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
        const relations = [...new Set(l.relations.map((r) => r.name))].join(", ")
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
            relations,
            // relation names always, the charter count on hover
            details: [relations, l.charters ? plural(l.charters) : ""].filter(Boolean).join(" · "),
        })
    }

    const lit = (_: unknown, s: { isHovered: boolean; isHighlighted: boolean; isLabelHovered: boolean }) =>
        s.isHovered || s.isHighlighted || s.isLabelHovered
    sigma = new SigmaCtor(graph, container.value, {
        primitives: {
            nodes: {
                label: {
                    font: { family: "system-ui, -apple-system, Segoe UI, sans-serif", weight: "600", size: 13 },
                    margin: 4,
                },
            },
            edges: {
                paths: [pathLine()],
                extremities: [extremityArrow()],
            },
        },
        settings: {
            // v4 measures sizes in graph units by default; these sizes are pixels
            itemSizesReference: "screen",
            renderEdgeLabels: true,
            enableEdgeEvents: true,
            // hovering or clicking a name acts like hovering or clicking its circle
            nodeLabelEvents: "extend",
            labelRenderedSizeThreshold: 0,
            stagePadding: 60,
            labelDensity: 1,
            labelGridCellSize: 40,
            minCameraRatio: 0.05,
            maxCameraRatio: 3,
        },
        styles: {
            nodes: [
                {
                    x: { attribute: "x" },
                    y: { attribute: "y" },
                    size: { attribute: "size" },
                    label: { attribute: "label" },
                    color: (a) =>
                        a.step === 0
                            ? palette.accent
                            : a.sex === "male"
                              ? palette.male
                              : a.sex === "female"
                                ? palette.female
                                : palette["sex-unknown"],
                    labelColor: () => palette.text,
                    labelVisibility: (a) => (a.step === 0 ? "visible" : "auto"),
                    cursor: (a) => (a.step === 0 ? "default" : "pointer"),
                    labelCursor: (a) => (a.step === 0 ? "default" : "pointer"),
                    depth: "nodes",
                    backdropVisibility: "hidden",
                    backdropColor: () => palette.surface,
                    backdropBorderColor: () => palette.muted,
                    backdropBorderWidth: 1,
                    backdropShadowColor: "rgba(0, 0, 0, 0.15)",
                    backdropShadowBlur: 6,
                    backdropPadding: 4,
                    backdropCornerRadius: 4,
                },
                {
                    // hover (circle or name) or highlight from the list: bigger, label on a box, on top
                    when: lit,
                    then: {
                        size: (a) => a.size * 1.4,
                        labelVisibility: "visible",
                        backdropVisibility: "visible",
                        depth: "topNodes",
                    },
                },
            ],
            edges: [
                {
                    size: { attribute: "size" },
                    color: (a) => (a.explicit ? palette.accent : palette.border),
                    head: { attribute: "head" },
                    tail: { attribute: "tail" },
                    label: { attribute: "relations" },
                    labelColor: () => palette.accent,
                    labelSize: 12,
                    depth: "edges",
                },
                {
                    when: lit,
                    then: {
                        color: () => palette.muted,
                        label: { attribute: "details" },
                        labelVisibility: "visible",
                        depth: "topEdges",
                    },
                },
            ],
        },
    })
    // frame: centre person in the middle, and at least one ring around it (a graph of two persons
    // would otherwise be stretched over the whole pane)
    const reach = Math.max(RING, ...[...pos.values()].map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
    sigma.setCustomBBox({ x: [-reach, reach], y: [-reach, reach] })
    applyHighlight(props.highlight)

    sigma.on("clickNode", ({ node, event }) => {
        if (node === props.id) return
        const e = event.original as MouseEvent
        if (e.altKey) emit("hide", node)
        else emit("select", node, e.ctrlKey || e.metaKey)
    })
    sigma.on("enterNode", ({ node }) => {
        if (node === props.id) return
        emit("hover", node)
        showTip(node)
    })
    sigma.on("leaveNode", () => {
        emit("hover", undefined)
        tip.value = undefined
    })
    sigma.getCamera().on("updated", () => {
        if (tip.value) showTip(tip.value.id)
    })
}

/** Tooltip above the hovered person: name and alternate spellings (only shown when there are some). */
function showTip(node: string) {
    if (!sigma) return
    const a = sigma.getGraph().getNodeAttributes(node)
    const p = sigma.graphToViewport({ x: a.x, y: a.y })
    tip.value = { id: node, x: p.x, y: p.y }
}

/** Highlight a person and its lines (hover in the list next to the graph). */
let highlighted: string | undefined
function applyHighlight(node?: string) {
    if (!sigma) return
    const graph = sigma.getGraph()
    if (highlighted && graph.hasNode(highlighted)) {
        sigma.setNodeState(highlighted, { isHighlighted: false })
        sigma.setEdgesState(graph.edges(highlighted), { isHighlighted: false })
    }
    highlighted = node && graph.hasNode(node) ? node : undefined
    if (highlighted) {
        sigma.setNodeState(highlighted, { isHighlighted: true })
        sigma.setEdgesState(graph.edges(highlighted), { isHighlighted: true })
    }
}

function onThemeChange() {
    readPalette()
    sigma?.refresh()
}

watch(
    () => props.highlight,
    (h) => applyHighlight(h),
)
watch(() => [props.id, props.depth, props.hidden.join(), props.hideUnrelated], render)

onMounted(() => {
    render()
    observer = new MutationObserver(onThemeChange)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", onThemeChange)
})
onBeforeUnmount(() => {
    renderId++
    observer?.disconnect()
    media?.removeEventListener("change", onThemeChange)
    sigma?.kill()
})
</script>

<template>
    <div class="person-graph-wrap">
        <div ref="container" class="person-graph" />
        <div
            v-if="tip && tipPerson?.altNames.length"
            class="graph-tip"
            role="tooltip"
            :style="{ left: `${tip.x}px`, top: `${tip.y}px` }"
        >
            <strong>{{ tipPerson.name }}</strong>
            <span class="muted">also: {{ tipPerson.altNames.join(", ") }}</span>
        </div>
    </div>
</template>
