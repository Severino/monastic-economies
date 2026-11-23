<script setup lang="ts">
import { X } from "lucide-vue-next"

useHead({ title: "Map · Monastic Economies" })
const route = useRoute()
const router = useRouter()
const { data: places } = await usePlaces()
const { data: catalog } = await useCatalog()
// CharterList in the panel needs persons; load them here so they are in the prerendered payload
await usePersons()

// selected place lives in the URL (?place=), so back/forward and shared links work
const selected = computed(() => (route.query.place as string) || undefined)
const select = (id?: string) => router.push({ query: { ...route.query, place: id } })

const place = computed(() => (selected.value ? places.value?.[selected.value] : undefined))
const roles = computed(() => Object.fromEntries(place.value?.charters.map((c) => [c.id, c.roles]) ?? []))
const entries = computed(() => (catalog.value ?? []).filter((e) => roles.value[e.id]))
const withoutCoords = computed(() => Object.values(places.value ?? {}).filter((p) => !p.coords).length)
</script>

<template>
    <div class="map-page">
        <ClientOnly>
            <PlacesMap :selected="selected" @select="select" />
            <template #fallback><div class="places-map" /></template>
        </ClientOnly>
        <aside v-if="place" class="map-panel">
            <button type="button" class="icon-btn map-panel-close" aria-label="Close" @click="select()">
                <X :size="18" aria-hidden="true" />
            </button>
            <p class="eyebrow">
                Place<template v-if="place.types.length"> · {{ place.types.join(", ") }}</template>
            </p>
            <h1>
                <NuxtLink :to="`/places/${place.id}`">{{ placeName(place) }}</NuxtLink>
            </h1>
            <h2>Charters ({{ entries.length }})</h2>
            <CharterList :entries="entries" :roles="roles" />
        </aside>
        <p v-if="withoutCoords && !place" class="map-note muted small">
            {{ withoutCoords }} {{ withoutCoords === 1 ? "place has" : "places have" }} no coordinates and
            {{ withoutCoords === 1 ? "is" : "are" }} not shown.
        </p>
    </div>
</template>

<style>
.map-page {
    position: relative;
    height: calc(100dvh - var(--header-h));
}
.places-map {
    position: absolute;
    inset: 0;
    background: var(--bg);
}
.map-panel {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    bottom: 2.5rem;
    width: min(26rem, calc(100% - 1.5rem));
    overflow-y: auto;
    padding: 1rem 1.25rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 18px rgb(0 0 0 / 0.15);
}
.map-panel h1 {
    font-size: 1.5rem;
    padding-right: 2rem;
}
.map-panel h1 a {
    color: inherit;
    text-decoration: none;
}
.map-panel h1 a:hover {
    color: var(--accent);
}
.map-panel h2 {
    margin-top: 1.25rem;
}
.map-panel-close {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
}
.map-note {
    position: absolute;
    right: 0.75rem;
    bottom: 1.75rem;
    margin: 0;
    padding: 0.2rem 0.5rem;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    border-radius: 4px;
}
@media (max-width: 40rem) {
    .map-panel {
        top: 45%;
        right: 0.75rem;
        bottom: 0.75rem;
        width: auto;
    }
}
/* MapLibre controls in the dark theme */
:root[data-theme="dark"] .maplibregl-ctrl-group,
:root[data-theme="dark"] .maplibregl-ctrl-attrib,
:root[data-theme="dark"] .maplibregl-ctrl-scale {
    filter: invert(0.9) hue-rotate(180deg);
}
@media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .maplibregl-ctrl-group,
    :root:not([data-theme="light"]) .maplibregl-ctrl-attrib,
    :root:not([data-theme="light"]) .maplibregl-ctrl-scale {
        filter: invert(0.9) hue-rotate(180deg);
    }
}
</style>
