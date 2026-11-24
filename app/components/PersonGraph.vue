<script setup lang="ts">
import type Sigma from "sigma"
import type { PersonNetwork } from "#shared/types"

// Network around one person, up to `depth` steps away. Rings = steps; within a ring
// every person sits in the sector of the person it was reached from (radial tree).
// Line thickness = number of shared charters; accent lines = explicit relations.
// Rendered client-only (WebGL); sigma is imported lazily so it stays out of SSR.
const props = defineProps<{
    id: string
    /** person id -> display name */
    names: Record<string, string>
    depth: number
    /** person highlighted from outside (hover in the list) */
    highlight?: string
    /** persons switched off: not shown and not followed to further steps */
    hidden: string[]
}>()
const emit = defineEmits<{
    /** ctrl/cmd-click: open that person */
    select: [id: string]
    /** click: switch a person off */
    hide: [id: string]
    hover: [id: string | undefined]
    /** number of persons per step: [1 step, 2 steps, …] */
    stats: [counts: number[]]
}>()

const container = ref<HTMLElement>()
let sigma: Sigma | undefined
let observer: MutationObserver | undefined
let media: MediaQueryList | undefined
let hoveredEdge: string | undefined

// colours come from the CSS tokens, re-read when the theme changes
const palette = { text: "", muted: "", border: "", accent: "", person: "", surface: "" }
function readPalette() {
    const s = getComputedStyle(document.documentElement)
    for (const k of Object.keys(palette) as (keyof typeof palette)[]) palette[k] = s.getPropertyValue(`--${k}`).trim()
}

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

/** Radial tree: ring = step, each subtree gets a sector proportional to its number of leaves. */
function layout(step: Map<string, number>, parent: Map<string, string>) {
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
    const ringSize = new Map<number, number>()
    for (const st of step.values()) ringSize.set(st, (ringSize.get(st) ?? 0) + 1)
    const placed = new Map<number, number>() // per ring, in angular order
    // sector width ~ sqrt(leaves): big subtrees get more room without squeezing the inner ring
    const weight = (n: string) => Math.sqrt(leaves.get(n)!)
    const place = (n: string, from: number, to: number) => {
        let a = from
        const kids = (children.get(n) ?? []).sort(
            (x, y) => leaves.get(y)! - leaves.get(x)! || (props.names[x] ?? x).localeCompare(props.names[y] ?? y),
        )
        const total = kids.reduce((t, c) => t + weight(c), 0)
        for (const c of kids) {
            const span = ((to - from) * weight(c)) / total
            const angle = a + span / 2 - Math.PI / 2
            // crowded ring: alternate two radii so neighbouring labels don't collide
            const ring = ringSize.get(step.get(c)!)!
            const i = placed.get(step.get(c)!) ?? 0
            placed.set(step.get(c)!, i + 1)
            const r = step.get(c)! + (ring > 20 && i % 2 ? 0.18 : 0)
            pos.set(c, { x: r * Math.cos(angle), y: r * Math.sin(angle) })
            place(c, a, a + span)
            a += span
        }
    }
    place(props.id, 0, 2 * Math.PI)
    return pos
}

const plural = (n: number) => `${n} shared charter${n === 1 ? "" : "s"}`

async function render() {
    if (!container.value) return
    const [
        { default: Graph },
        { default: SigmaCtor },
        adj,
        { EdgeDoubleArrowProgram },
        { DEFAULT_EDGE_PROGRAM_CLASSES },
    ] = await Promise.all([
        import("graphology"),
        import("sigma"),
        loadNetwork(),
        import("sigma/rendering"),
        import("sigma/settings"),
    ])
    sigma?.kill()
    readPalette()

    const { step, parent } = explore(adj)
    const pos = layout(step, parent)
    const counts = Array.from({ length: props.depth }, (_, i) => [...step.values()].filter((s) => s === i + 1).length)
    emit("stats", counts)

    const graph = new Graph()
    for (const [n, s] of step)
        graph.addNode(n, {
            ...pos.get(n)!,
            size: s === 0 ? 14 : Math.max(4, 10 - 2 * s),
            label: props.names[n] ?? n,
            step: s,
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
            type: out && inn ? "doubleArrow" : out || inn ? "arrow" : "line",
            // thickness by shared charters (square root, so a few strong ties don't dwarf the rest)
            // (explicit relations at least 2 px, so their arrow heads stay visible)
            size: Math.max(
                l.relations.length ? 2 : 1,
                l.charters ? 1 + 5 * Math.sqrt((l.charters - 1) / Math.max(1, max - 1)) : 1,
            ),
            explicit: l.relations.length > 0,
            relations: [...new Set(l.relations.map((r) => r.name))].join(", "),
            charters: l.charters,
        })
    }

    sigma = new SigmaCtor(graph, container.value, {
        renderEdgeLabels: true,
        enableEdgeEvents: true,
        labelRenderedSizeThreshold: 0,
        labelFont: "system-ui, -apple-system, Segoe UI, sans-serif",
        labelSize: 13,
        edgeLabelSize: 12,
        stagePadding: 80,
        labelDensity: 1,
        labelGridCellSize: 40,
        minCameraRatio: 0.05,
        maxCameraRatio: 3,
        ...themeSettings(),
        defaultDrawNodeHover: drawHover,
        defaultDrawNodeLabel: drawLabel,
        edgeProgramClasses: { ...DEFAULT_EDGE_PROGRAM_CLASSES, doubleArrow: EdgeDoubleArrowProgram },
        nodeReducer: (node, a) => ({
            ...a,
            color: a.step === 0 ? palette.accent : palette.person,
            size: node === props.highlight ? a.size * 1.5 : a.size,
            highlighted: node === props.highlight,
            zIndex: node === props.highlight ? 1 : 0,
        }),
        edgeReducer: (edge, a) => {
            const hovered = edge === hoveredEdge
            const ends = graph.extremities(edge)
            const lit = hovered || (!!props.highlight && ends.includes(props.highlight))
            const text = [a.relations, a.charters ? plural(a.charters) : ""].filter(Boolean).join(" · ")
            return {
                ...a,
                color: lit ? palette.muted : a.explicit ? palette.accent : palette.border,
                // relation names always, the charter count on hover
                label: hovered ? text : a.relations || undefined,
                forceLabel: hovered,
                zIndex: lit ? 1 : 0,
            }
        },
        zIndex: true,
    })

    sigma.on("clickNode", ({ node, event }) => {
        if (node === props.id) return
        const e = event.original as MouseEvent
        if (e.ctrlKey || e.metaKey) emit("select", node)
        else emit("hide", node)
    })
    sigma.on("enterNode", ({ node }) => {
        emit("hover", node === props.id ? undefined : node)
        container.value!.style.cursor = node === props.id ? "" : "pointer"
    })
    sigma.on("leaveNode", () => {
        emit("hover", undefined)
        container.value!.style.cursor = ""
    })
    sigma.on("enterEdge", ({ edge }) => {
        hoveredEdge = edge
        sigma?.refresh({ skipIndexation: true })
    })
    sigma.on("leaveEdge", () => {
        hoveredEdge = undefined
        sigma?.refresh({ skipIndexation: true })
    })
}

const themeSettings = () => ({
    labelColor: { color: palette.text },
    edgeLabelColor: { color: palette.accent },
})

type LabelData = { x: number; y: number; size: number; label?: string | null }
type LabelSettings = { labelSize: number; labelFont: string; labelWeight: string }

/** First name bold, the rest of the name below it in normal weight. */
function drawLabel(ctx: CanvasRenderingContext2D, data: LabelData, settings: LabelSettings) {
    if (!data.label) return
    const { first, rest } = splitName(data.label)
    const size = settings.labelSize
    const x = data.x + data.size + 3
    ctx.fillStyle = palette.text
    ctx.font = `600 ${size}px ${settings.labelFont}`
    ctx.fillText(first, x, rest ? data.y - 1 : data.y + size / 3)
    if (rest) {
        ctx.font = `400 ${size}px ${settings.labelFont}`
        ctx.fillText(rest, x, data.y + size)
    }
}

/** Hover / highlight: label on a surface-coloured box (sigma's default box is always white). */
function drawHover(ctx: CanvasRenderingContext2D, data: LabelData, settings: LabelSettings) {
    const size = settings.labelSize
    const { first, rest } = splitName(data.label ?? "")
    ctx.font = `600 ${size}px ${settings.labelFont}`
    let width = ctx.measureText(first).width
    ctx.font = `400 ${size}px ${settings.labelFont}`
    width = Math.max(width, ctx.measureText(rest).width) + 8
    const height = rest ? 2 * size + 10 : size + 10
    const top = rest ? data.y - size - 4 : data.y - size / 2 - 5
    ctx.fillStyle = palette.surface
    ctx.strokeStyle = palette.muted
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(
        data.x - data.size - 3,
        Math.min(top, data.y - data.size - 3),
        data.size * 2 + 6 + width,
        Math.max(height, data.size * 2 + 6),
        4,
    )
    ctx.fill()
    ctx.stroke()
    drawLabel(ctx, data, settings)
}

function onThemeChange() {
    readPalette()
    sigma?.setSettings(themeSettings())
}

watch(
    () => props.highlight,
    () => sigma?.refresh({ skipIndexation: true }),
)
watch(() => [props.id, props.depth, props.hidden.join()], render)

onMounted(() => {
    render()
    observer = new MutationObserver(onThemeChange)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", onThemeChange)
})
onBeforeUnmount(() => {
    observer?.disconnect()
    media?.removeEventListener("change", onThemeChange)
    sigma?.kill()
})
</script>

<template>
    <div ref="container" class="person-graph" />
</template>
