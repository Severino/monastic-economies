<script setup lang="ts">
import MiniSearch from "minisearch"
import { SEARCH_OPTIONS } from "#shared/search"

useHead({ title: "Charters · Monastic Economies" })

const route = useRoute()
const router = useRouter()
const { data: catalog } = await useCatalog()
const { data: persons } = await usePersons()
const { data: places } = await usePlaces()

// ---- filter state lives in the URL ------------------------------------------
const q = (k: string) => (typeof route.query[k] === "string" ? (route.query[k] as string) : "")
// selects push a history entry (back undoes a filter); typing only replaces
function setQuery(k: string, v: string, replace = false) {
    const to = { query: { ...route.query, [k]: v || undefined } }
    replace ? router.replace(to) : router.push(to)
}
const text = ref(q("q"))
let t: ReturnType<typeof setTimeout> | undefined
watch(text, (v) => {
    clearTimeout(t)
    t = setTimeout(() => setQuery("q", v.trim(), true), 250)
})
watch(
    () => route.query.q,
    () => {
        if (q("q") !== text.value.trim()) text.value = q("q")
    },
)

// ---- full-text search (client only; index loaded lazily) ----------------------
const search = shallowRef<MiniSearch | null>(null)
onMounted(async () => {
    const json = await $fetch<object>("/data/search-index.json")
    search.value = MiniSearch.loadJS(json as any, SEARCH_OPTIONS)
})

const results = computed(() => {
    let list = catalog.value ?? []
    const person = q("person"),
        place = q("place"),
        action = q("action"),
        query = q("q")
    if (person) list = list.filter((e) => e.persons.includes(person))
    if (place) list = list.filter((e) => e.places.includes(place))
    if (action) list = list.filter((e) => e.actionTypes.includes(action))
    if (query && search.value) {
        const hits = new Map(search.value.search(query).map((h) => [h.id as string, h.score]))
        list = list.filter((e) => hits.has(e.id)).sort((a, b) => hits.get(b.id)! - hits.get(a.id)!)
    }
    return list
})

// options for the select filters, derived from the catalog
const options = computed(() => {
    const c = catalog.value ?? []
    const uniq = (xs: string[]) => [...new Set(xs)]
    return {
        persons: uniq(c.flatMap((e) => e.persons))
            .map((id) => ({ id, name: persons.value?.[id]?.name ?? id }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        places: uniq(c.flatMap((e) => e.places))
            .map((id) => ({ id, name: placeName(places.value?.[id]) }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        actions: uniq(c.flatMap((e) => e.actionTypes)).sort(),
    }
})
const active = computed(() => ["q", "person", "place", "action"].some((k) => q(k)))
</script>

<template>
    <div class="container">
        <h1>Charters</h1>
        <form class="filters" role="search" @submit.prevent>
            <input
                v-model="text"
                type="search"
                placeholder="Search text, persons, places…"
                aria-label="Full-text search"
            />
            <select
                :value="q('person')"
                aria-label="Person"
                @change="setQuery('person', ($event.target as HTMLSelectElement).value)"
            >
                <option value="">All persons</option>
                <option v-for="p in options.persons" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <select
                :value="q('place')"
                aria-label="Place"
                @change="setQuery('place', ($event.target as HTMLSelectElement).value)"
            >
                <option value="">All places</option>
                <option v-for="p in options.places" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <select
                :value="q('action')"
                aria-label="Action"
                @change="setQuery('action', ($event.target as HTMLSelectElement).value)"
            >
                <option value="">All actions</option>
                <option v-for="a in options.actions" :key="a" :value="a">{{ label(a) }}</option>
            </select>
            <NuxtLink v-if="active" to="/charters" class="reset">Reset</NuxtLink>
        </form>
        <p class="muted">{{ results.length }} of {{ catalog?.length ?? 0 }} charters</p>
        <CharterList :entries="results" />
    </div>
</template>
