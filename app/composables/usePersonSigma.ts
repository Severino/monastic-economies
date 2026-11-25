import type Graph from "graphology"
import type { Person } from "#shared/types"
import type Sigma from "sigma"

/**
 * sigma.js 4 setup shared by the person diagrams (network graph and relation tree).
 *
 * Node attributes: x, y, size, label (first name), alt (alternate spellings, joined), sex ("male" | "female" | ""),
 * centre (boolean). Edge attributes: size, explicit (has a relation), relations (label), head / tail
 * ("arrow" | "none").
 *
 * Node attribute `pinned` (boolean) draws a ring around the circle (see useLiveLayout).
 *
 * Interaction: drag a person to move it (double click releases it), click selects it (click again or on the background to clear),
 * Ctrl/⌘-click opens it, Alt-click hides it (where the diagram supports hiding). Hovered, selected and
 * list-highlighted persons get their label on a box, with the alternate spellings below the name in smaller
 * type (`tips`, rendered as HTML by the diagram component: `<PersonTips :tips="tips" />`).
 * Colours come from the CSS tokens; on a theme change the renderer is rebuilt on the same graph, so dragged
 * positions survive.
 */
export interface PersonSigmaHandlers {
    select: (id: string | undefined) => void
    open: (id: string) => void
    hide?: (id: string) => void
    hover: (id: string | undefined) => void
    /** dragging a person (graph units), e.g. to let a force simulation follow */
    drag?: (id: string, phase: "start" | "move" | "end") => void
    /** double click: release a pinned person */
    unpin?: (id: string) => void
}

const FONT_FAMILY = "system-ui, -apple-system, Segoe UI, sans-serif"
let measure: CanvasRenderingContext2D | undefined
/** Width of a text in px: names are 600 13px, relation labels 12px (as drawn in the diagrams). */
export function textWidth(text: string, kind: "name" | "relation") {
    measure ??= document.createElement("canvas").getContext("2d")!
    measure.font = kind === "name" ? `600 13px ${FONT_FAMILY}` : `400 12px ${FONT_FAMILY}`
    return measure.measureText(text).width
}

const FONT = FONT_FAMILY

export function usePersonSigma(container: Ref<HTMLElement | undefined>, on: PersonSigmaHandlers) {
    let sigma: Sigma | undefined
    let SigmaCtor: typeof Sigma | undefined
    let rendering: typeof import("sigma/rendering") | undefined
    let current: { graph: Graph; bbox: { x: [number, number]; y: [number, number] } } | undefined
    let observer: MutationObserver | undefined
    let media: MediaQueryList | undefined

    // ---- colours from the CSS tokens ------------------------------------------------
    const palette = {
        text: "",
        muted: "",
        border: "",
        accent: "",
        surface: "",
        "relation-chip": "",
        male: "",
        female: "",
        "sex-unknown": "",
    }
    function readPalette() {
        const s = getComputedStyle(document.documentElement)
        for (const k of Object.keys(palette) as (keyof typeof palette)[])
            palette[k] = s.getPropertyValue(`--${k}`).trim()
    }

    // ---- highlighted persons: hovered in the diagram, hovered in the list, selected --------
    const lit = { hovered: undefined as string | undefined, list: undefined as string | undefined, selected: "" }
    let shown = new Set<string>()
    function applyLit() {
        if (!sigma) return
        const graph = sigma.getGraph()
        const next = new Set([lit.hovered, lit.list, lit.selected].filter((n): n is string => !!n && graph.hasNode(n)))
        for (const n of shown)
            if (!next.has(n) && graph.hasNode(n)) {
                sigma.setNodeState(n, { isHighlighted: false })
                sigma.setEdgesState(graph.edges(n), { isHighlighted: false })
            }
        // edges stay lit while either end is lit
        for (const n of next) {
            sigma.setNodeState(n, { isHighlighted: true })
            sigma.setEdgesState(graph.edges(n), { isHighlighted: true })
        }
        shown = next
        placeTips()
    }

    // Alternate spellings: an HTML box over the label of every highlighted person that has some, with the
    // name and below it the other spellings in smaller type. (sigma's own label attachments made the other
    // labels disappear while shown, sigma 4.0.6.) Repositioned after every frame (camera moves, dragging).
    const tips = ref<{ id: string; x: number; y: number; name: string; alt: string }[]>([])
    function placeTips() {
        if (!sigma) return
        const s = sigma
        const graph = s.getGraph()
        const next = [...shown]
            .filter((n) => graph.hasNode(n) && graph.getNodeAttribute(n, "alt"))
            .map((n) => {
                const a = graph.getNodeAttributes(n)
                const p = s.graphToViewport({ x: a.x, y: a.y })
                // top of the label: centre + lit radius + label margin
                return { id: n, x: p.x, y: p.y + s.scaleSize(a.size * 1.3) + 3, name: a.label, alt: a.alt }
            })
        if (next.length || tips.value.length) tips.value = next
    }

    function create() {
        if (!container.value || !current || !SigmaCtor || !rendering) return
        sigma?.kill()
        readPalette()
        const isLit = (_: unknown, s: { isHovered: boolean; isHighlighted: boolean; isLabelHovered: boolean }) =>
            s.isHovered || s.isHighlighted || s.isLabelHovered
        const s = new SigmaCtor(current.graph, container.value, {
            primitives: {
                nodes: {
                    label: { font: { family: FONT, weight: "600", size: 13 }, margin: 3 },
                },
                edges: {
                    paths: [rendering.pathLine()],
                    extremities: [rendering.extremityArrow()],
                },
            },
            settings: {
                // v4 measures sizes in graph units by default; these sizes are pixels
                itemSizesReference: "screen",
                renderEdgeLabels: true,
                // hovering, clicking or dragging a name acts like doing it on its circle
                nodeLabelEvents: "extend",
                enableNodeDrag: true,
                labelRenderedSizeThreshold: 0,
                stagePadding: 50,
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
                            a.centre
                                ? palette.accent
                                : a.sex === "male"
                                  ? palette.male
                                  : a.sex === "female"
                                    ? palette.female
                                    : palette["sex-unknown"],
                        labelColor: () => palette.text,
                        labelPosition: "below",
                        labelVisibility: (a) => (a.centre ? "visible" : "auto"),
                        cursor: "grab",
                        labelCursor: "grab",
                        depth: "nodes",
                        backdropVisibility: "hidden",
                        backdropArea: "both",
                        backdropColor: () => palette.surface,
                        backdropBorderColor: () => palette.muted,
                        backdropBorderWidth: 1,
                        backdropShadowColor: "rgba(0, 0, 0, 0.15)",
                        backdropShadowBlur: 6,
                        backdropPadding: 4,
                        backdropCornerRadius: 4,
                    },
                    {
                        // pinned (dragged) persons: a ring around the circle
                        when: (a) => !!a.pinned,
                        then: {
                            backdropVisibility: "visible",
                            backdropArea: "node",
                            backdropShadowBlur: 0,
                            backdropPadding: 3,
                        },
                    },
                    {
                        // hover (circle or name), selection or list hover: bigger, label on a box with the
                        // alternate spellings below the name, on top
                        when: isLit,
                        then: {
                            size: (a) => a.size * 1.3,
                            labelVisibility: "visible",
                            backdropVisibility: "visible",
                            // with alternate spellings the HTML box covers the label, the backdrop rings the circle
                            backdropArea: (a) => (a.alt ? "node" : "both"),
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
                        // relation names on a solid background in the page's surface colour
                        label: { attribute: "relations" },
                        labelColor: () => palette.accent,
                        labelBackgroundColor: () => palette["relation-chip"],
                        labelBackgroundPadding: 5,
                        labelSize: 12,
                        // relation names always show (sigma otherwise only labels lines whose two persons show
                        // their names, so zooming in, with one end off screen, dropped them)
                        labelVisibility: (a) => (a.relations ? "visible" : "hidden"),
                        depth: "edges",
                    },
                    {
                        when: isLit,
                        then: {
                            color: (a) => (a.explicit ? palette.accent : palette.muted),
                            depth: "topEdges",
                        },
                    },
                ],
            },
        })
        s.setCustomBBox(current.bbox)
        s.on("clickNode", ({ node, event }) => {
            const e = event.original as MouseEvent
            if (e.ctrlKey || e.metaKey) on.open(node)
            else if (e.altKey && on.hide) on.hide(node)
            else on.select(node === lit.selected ? undefined : node)
        })
        s.on("clickStage", () => on.select(undefined))
        s.on("doubleClickNode", ({ node, preventSigmaDefault }) => {
            preventSigmaDefault()
            on.unpin?.(node)
        })
        s.on("enterNode", ({ node }) => {
            lit.hovered = node
            on.hover(node)
            applyLit()
        })
        s.on("leaveNode", () => {
            lit.hovered = undefined
            on.hover(undefined)
            applyLit()
        })
        s.on("afterRender", placeTips)
        s.on("nodeDragStart", ({ node, preventSigmaDefault }) => {
            // the centre person stays in the middle (everyone else is laid out around it)
            if (s.getGraph().getNodeAttribute(node, "centre")) return preventSigmaDefault()
            on.drag?.(node, "start")
        })
        s.on("nodeDrag", ({ node }) => on.drag?.(node, "move"))
        s.on("nodeDragEnd", ({ node }) => on.drag?.(node, "end"))
        sigma = s
        shown = new Set()
        applyLit()
    }

    /** Shows a graph; positions in graph units, `bbox` = the area to frame. */
    /**
     * Shows a graph. Positions are in graph units, `content` = the area to frame. The frame is at least as big as
     * the pane, so while the diagram fits one graph unit is one pixel and lines keep the length they were laid
     * out with (long enough for their labels); a bigger diagram is zoomed out to fit.
     */
    async function mount(graph: Graph, content: { x: [number, number]; y: [number, number] }) {
        ;[{ default: SigmaCtor }, rendering] = await Promise.all([import("sigma"), import("sigma/rendering")])
        const w = (container.value?.clientWidth ?? 600) - 100
        const h = (container.value?.clientHeight ?? 400) - 100
        const half = (r: [number, number], min: number) => Math.max((r[1] - r[0]) / 2, min / 2)
        const mid = (r: [number, number]) => (r[0] + r[1]) / 2
        const [hx, hy] = [half(content.x, w), half(content.y, h)]
        const bbox = {
            x: [mid(content.x) - hx, mid(content.x) + hx] as [number, number],
            y: [mid(content.y) - hy, mid(content.y) + hy] as [number, number],
        }
        current = { graph, bbox }
        lit.hovered = undefined
        create()
    }

    function onThemeChange() {
        if (sigma) create()
    }
    onMounted(() => {
        observer = new MutationObserver(onThemeChange)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
        media = window.matchMedia("(prefers-color-scheme: dark)")
        media.addEventListener("change", onThemeChange)
    })
    onBeforeUnmount(() => {
        observer?.disconnect()
        media?.removeEventListener("change", onThemeChange)
        sigma?.kill()
        sigma = undefined
    })

    return {
        mount,
        /** boxes with alternate spellings (viewport px: x = centre, y = top), rendered by the diagram */
        tips,
        /** person hovered in the list next to the diagram */
        setListHighlight(id?: string) {
            lit.list = id
            applyLit()
        },
        setSelected(id?: string) {
            lit.selected = id ?? ""
            applyLit()
        },
    }
}

/** Node attributes shared by both diagrams. */
export function personNode(p: Person | undefined, id: string, centre: boolean) {
    return {
        label: p?.name ?? id,
        alt: p?.altNames.join(", ") ?? "",
        sex: sexOf(p?.sex) ?? "",
        centre,
    }
}
