<template>
    <div class="map-page">
        <ClientOnly>
            <PlacesMap
                :selected="selected"
                :show-empty="showEmpty"
                @select="select"
            />
            <template #fallback>
                <div class="places-map" />
            </template>
        </ClientOnly>
        <aside
            v-if="place"
            class="map-panel"
        >
            <button
                type="button"
                class="icon-btn map-panel-close"
                aria-label="Close"
                @click="select()"
            >
                <X
                    :size="18"
                    aria-hidden="true"
                />
            </button>
            <p class="eyebrow">
                Place<template v-if="place.types.length"> · {{ place.types.join(", ") }}</template>
            </p>
            <h1>
                <NuxtLink :to="`/places/${place.id}`">{{ placeName(place) }}</NuxtLink>
            </h1>
            <h2>Charters ({{ entries.length }})</h2>
            <CharterList
                :entries="entries"
                :roles="roles"
            />
        </aside>
        <div
            class="map-controls small"
            :class="{ 'has-panel': place }"
        >
            <div class="map-legend">
                <label class="muted">Charters</label>
                <span
                    class="map-scale"
                    aria-hidden="true"
                />
                <span class="map-scale-labels muted"><span
                        v-for="l in LEGEND"
                        :key="l.label"
                    >{{ l.label }}</span></span>
            </div>
            <label class="map-toggle interactive">
                <label>
                    <input
                        v-model="showEmpty"
                        type="checkbox"
                        style="display: none;"
                    />
                    <div class="map-dot">
                    </div>
                </label>


                Places without charters ({{ withoutCharters }})
            </label>
            <p
                v-if="withoutCoords"
                class="muted"
            >
                {{ withoutCoords }} {{ withoutCoords === 1 ? "place has" : "places have" }} no coordinates.
            </p>
        </div>
    </div>
</template>

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
const withoutCharters = computed(
    () => Object.values(places.value ?? {}).filter((p) => p.coords && !p.charters.length).length,
)

// places without charters are hidden by default; the choice is kept per browser
const SHOW_EMPTY_KEY = "monastic-economies:map-show-empty"
const showEmpty = ref(false)
onMounted(() => {
    try {
        showEmpty.value = localStorage.getItem(SHOW_EMPTY_KEY) === "1"
    } catch {
        /* storage unavailable: keep default */
    }
})
watch(showEmpty, (v) => {
    try {
        localStorage.setItem(SHOW_EMPTY_KEY, v ? "1" : "0")
    } catch {
        /* ignore */
    }
})

const LEGEND = [
    { label: "1", color: "var(--map-1)" },
    { label: "3", color: "var(--map-3)" },
    { label: "5+", color: "var(--map-5)" },
]
</script>


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

.map-controls {
    position: absolute;
    right: 0.75rem;
    bottom: 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.6rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.12);
}

.map-controls p {
    margin: 0;
}

.map-legend {
    display: grid;
    grid-template-columns: auto 7rem;
    column-gap: 0.6rem;
    align-items: center;
}

.map-scale {
    height: 0.6rem;
    border-radius: 3px;
    background: linear-gradient(to right, var(--map-1), var(--map-3), var(--map-5));
}

.map-scale-labels {
    grid-column: 2;
    display: flex;
    justify-content: space-between;
    font-size: 0.85em;
}

.map-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
}

.map-toggle input {
    margin: 0;
    accent-color: var(--accent);
}

input:checked + .map-dot {
    border-style: solid;
    background: var(--map-0);
}

.map-dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    border-width: 1px;

    
    border-style: dotted;
    background: transparent;
}

@media (max-width: 40rem) {
    .map-controls.has-panel {
        display: none;
    }

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
