import type Graph from "graphology"
import type { Force, Simulation } from "d3-force"

/** A person in a live force layout (graph units). */
export interface LiveNode {
    id: string
    x: number
    y: number
    vx?: number
    vy?: number
    fx?: number | null
    fy?: number | null
    /** collision radius: circle and the name below it */
    radius: number
    /** where the node is held when it is not pinned (the centre person) */
    anchor?: { x: number; y: number }
}

const PINS = "monastic-economies:pins:"

/**
 * Live d3-force layout behind a sigma diagram, shared by the person graph and the relation tree.
 *
 * The simulation keeps running while a person is dragged, so the others make room. A dragged person stays
 * pinned where it was dropped; a double click releases it. Pins are stored per diagram and person in
 * `localStorage` (`monastic-economies:pins:<key>`) and applied again when the diagram is shown.
 * Pinned persons get the node attribute `pinned` (drawn as a ring by usePersonSigma).
 */
export function useLiveLayout<N extends LiveNode, L>(pinKey: () => string) {
    let sim: Simulation<N, L> | undefined
    let nodes = new Map<string, N>()
    let graph: Graph | undefined
    let pins: Record<string, { x: number; y: number }> = {}
    let pinsFor = ""

    function loadPins() {
        const key = pinKey()
        if (key === pinsFor) return
        pinsFor = key
        try {
            pins = JSON.parse(localStorage.getItem(PINS + key) ?? "{}") ?? {}
        } catch {
            pins = {}
        }
    }
    function savePins() {
        try {
            if (Object.keys(pins).length) localStorage.setItem(PINS + pinsFor, JSON.stringify(pins))
            else localStorage.removeItem(PINS + pinsFor)
        } catch {
            // storage unavailable (private mode): pins last for this visit only
        }
    }

    /** Puts pinned persons where they were left (call before the simulation runs). */
    function applyPins(ns: Map<string, N>) {
        loadPins()
        for (const n of ns.values()) {
            const p = pins[n.id] ?? n.anchor
            if (!p) continue
            n.x = n.fx = p.x
            n.y = n.fy = p.y
        }
    }

    /** Connects a settled simulation to the graph sigma shows: every tick moves the nodes. */
    function attach(s: Simulation<N, L>, ns: Map<string, N>, g: Graph, onTick?: () => void) {
        sim?.stop()
        sim = s
        nodes = ns
        graph = g
        for (const n of ns.values()) g.setNodeAttribute(n.id, "pinned", !!pins[n.id])
        s.on("tick", () => {
            g.updateEachNodeAttributes((id, a) => {
                const p = ns.get(id)
                return p ? { ...a, x: p.x, y: p.y } : a
            })
            onTick?.()
        })
    }

    function drag(id: string, phase: "start" | "move" | "end") {
        const n = nodes.get(id)
        if (!sim || !n || !graph) return
        const a = graph.getNodeAttributes(id)
        n.fx = a.x
        n.fy = a.y
        if (phase === "start") sim.alphaTarget(0.3).restart()
        if (phase === "end") {
            pins[id] = { x: a.x, y: a.y }
            savePins()
            graph.setNodeAttribute(id, "pinned", true)
            sim.alphaTarget(0)
        }
    }

    function unpin(id: string) {
        const n = nodes.get(id)
        if (!pins[id] || !n || !sim || !graph) return
        delete pins[id]
        savePins()
        n.fx = n.anchor?.x ?? null
        n.fy = n.anchor?.y ?? null
        graph.setNodeAttribute(id, "pinned", false)
        sim.alpha(0.5).restart()
    }

    onBeforeUnmount(() => sim?.stop())

    return { applyPins, attach, drag, unpin, stop: () => sim?.stop() }
}

/**
 * Pushes every free person away from the centre person (at 0, 0) with the same force (d3-force custom force).
 * Nothing pulls towards the centre: only the lines hold persons in, so a person sits as far out as its lines let it,
 * and a person with a single relation hangs beyond its partner. Everyone is connected, so nobody drifts away.
 */
export function forceOutward<N extends LiveNode>(push: number): Force<N, undefined> {
    let ns: N[] = []
    const force = (alpha: number) => {
        for (const n of ns) {
            const d = Math.hypot(n.x, n.y)
            if (d < 1e-3) {
                // a person exactly in the middle: push in some direction
                n.vx = (n.vx ?? 0) + push * alpha
                continue
            }
            n.vx = (n.vx ?? 0) + (n.x / d) * push * alpha
            n.vy = (n.vy ?? 0) + (n.y / d) * push * alpha
        }
    }
    force.initialize = (nodes: N[]) => {
        ns = nodes
    }
    return force
}
