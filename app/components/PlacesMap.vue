<script setup lang="ts">
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

/**
 * Map of all places with coordinates. Client-only (MapLibre needs the DOM).
 * Basemap: OpenFreeMap vector tiles (free, no API key), light or dark style
 * following the site theme. Clicking a place emits its id; the selected place
 * is highlighted.
 */
const props = defineProps<{ selected?: string }>()
const emit = defineEmits<{ select: [id: string | undefined] }>()

const STYLES = {
    light: "https://tiles.openfreemap.org/styles/positron",
    dark: "https://tiles.openfreemap.org/styles/dark",
}

const { data: places } = await usePlaces()
const dark = useDarkTheme()
const container = ref<HTMLElement>()
let map: MlMap | undefined

const features = computed(() =>
    Object.values(places.value ?? {})
        .filter((p) => p.coords)
        .map((p) => ({
            type: "Feature" as const,
            id: p.id,
            geometry: { type: "Point" as const, coordinates: p.coords! },
            properties: { id: p.id, name: placeName(p), charters: p.charters.length },
        })),
)
const geojson = computed(() => ({ type: "FeatureCollection" as const, features: features.value }))

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** Source and layers have to be added again after every style change. */
function addLayers(m: MlMap) {
    const place = cssVar("--place")
    const surface = cssVar("--surface")
    const text = cssVar("--text")
    const hl = cssVar("--accent")
    m.addSource("places", {
        type: "geojson",
        data: geojson.value,
        cluster: true,
        clusterRadius: 36,
        clusterMaxZoom: 9,
        clusterProperties: { charters: ["+", ["get", "charters"]] },
    })
    m.addLayer({
        id: "clusters",
        type: "circle",
        source: "places",
        filter: ["has", "point_count"],
        paint: {
            "circle-color": place,
            "circle-opacity": 0.85,
            "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 14, 50, 26],
            "circle-stroke-width": 2,
            "circle-stroke-color": surface,
        },
    })
    m.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "places",
        filter: ["has", "point_count"],
        layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 12,
            "text-allow-overlap": true,
        },
        paint: { "text-color": surface },
    })
    m.addLayer({
        id: "place-points",
        type: "circle",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        paint: {
            // area ~ number of charters
            "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "charters"]], 1, 6, 10, 18],
            "circle-color": place,
            "circle-stroke-width": ["case", ["==", ["get", "id"], props.selected ?? ""], 3, 1.5],
            "circle-stroke-color": ["case", ["==", ["get", "id"], props.selected ?? ""], hl, surface],
        },
    })
    m.addLayer({
        id: "place-labels",
        type: "symbol",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
            "text-offset": [0, 1.1],
            "text-anchor": "top",
            "text-optional": true,
        },
        paint: {
            "text-color": text,
            "text-halo-color": surface,
            "text-halo-width": 1.5,
        },
    })
}

function updateSelection() {
    if (!map?.getLayer("place-points")) return
    const sel = ["==", ["get", "id"], props.selected ?? ""] as const
    map.setPaintProperty("place-points", "circle-stroke-width", ["case", sel, 3, 1.5])
    map.setPaintProperty("place-points", "circle-stroke-color", ["case", sel, cssVar("--accent"), cssVar("--surface")])
}

/** Space covered by the place panel of the map page (left on wide screens, bottom on phones). */
function panelPadding() {
    const el = map!.getContainer()
    return el.clientWidth > 640
        ? { top: 0, bottom: 0, left: Math.min(440, el.clientWidth / 2), right: 0 }
        : { top: 0, bottom: el.clientHeight * 0.55, left: 0, right: 0 }
}

/** Bring the selected place into view (e.g. after back/forward or a shared link). */
function revealSelected(animate: boolean) {
    const p = props.selected ? places.value?.[props.selected] : undefined
    if (!map || !p?.coords) return
    const pad = panelPadding()
    const pt = map.project(p.coords)
    const el = map.getContainer()
    const visible =
        pt.x > pad.left + 20 && pt.x < el.clientWidth - 20 && pt.y > 20 && pt.y < el.clientHeight - pad.bottom - 20
    if (visible && map.getZoom() >= 9) return
    map.easeTo({
        center: p.coords,
        zoom: Math.max(map.getZoom(), 10),
        // shift the target into the free part of the map (offset, unlike padding, does not persist)
        offset: [pad.left / 2, -pad.bottom / 2],
        duration: animate ? 600 : 0,
    })
}

function fitAll() {
    if (!map || !features.value.length) return
    const lons = features.value.map((f) => f.geometry.coordinates[0])
    const lats = features.value.map((f) => f.geometry.coordinates[1])
    map.fitBounds(
        [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 60, maxZoom: 9, duration: 0 },
    )
}

onMounted(async () => {
    const { Map, NavigationControl, ScaleControl } = await import("maplibre-gl")
    if (!container.value) return
    const m = new Map({
        container: container.value,
        style: dark.value ? STYLES.dark : STYLES.light,
        center: [9, 49.5],
        zoom: 5,
        attributionControl: { compact: true },
    })
    map = m
    m.addControl(new NavigationControl({ showCompass: false }), "top-right")
    m.addControl(new ScaleControl(), "bottom-left")

    let first = true
    m.on("style.load", () => {
        addLayers(m)
        if (first) {
            first = false
            fitAll()
            revealSelected(false)
        }
    })

    m.on("click", "place-points", (e: MapLayerMouseEvent) => {
        emit("select", e.features?.[0]?.properties.id)
    })
    m.on("click", "clusters", async (e: MapLayerMouseEvent) => {
        const f = e.features?.[0]
        if (!f) return
        const src = m.getSource("places") as GeoJSONSource
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id)
        m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom })
    })
    m.on("click", (e) => {
        // a click on empty map closes the selection
        if (!m.queryRenderedFeatures(e.point, { layers: ["place-points", "clusters"] }).length && props.selected)
            emit("select", undefined)
    })
    for (const layer of ["place-points", "clusters"]) {
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"))
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""))
    }
})

watch(dark, (d) => map?.setStyle(d ? STYLES.dark : STYLES.light))
watch(
    () => props.selected,
    () => {
        updateSelection()
        revealSelected(true)
    },
)

onBeforeUnmount(() => map?.remove())
</script>

<template>
    <div ref="container" class="places-map" role="region" aria-label="Map of places" />
</template>
