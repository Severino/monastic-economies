<script setup lang="ts">
import { RotateCcw, Search } from "lucide-vue-next"
import { queryTerms, searchDocs, snippet, type SearchDoc } from "#shared/search"

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

// ---- text search (client only; data loaded lazily) ---------------------------
const docs = shallowRef<SearchDoc[] | null>(null)
onMounted(async () => {
    docs.value = await $fetch<SearchDoc[]>("/data/search.json")
})
const texts = computed(() => Object.fromEntries((docs.value ?? []).map((d) => [d.id, d.text])))

const results = computed(() => {
    let list = catalog.value ?? []
    const person = q("person"),
        place = q("place"),
        action = q("action"),
        query = q("q")
    if (person) list = list.filter((e) => e.persons.includes(person))
    if (place) list = list.filter((e) => e.places.includes(place))
    if (action) list = list.filter((e) => e.actionTypes.includes(action))
    if (query && docs.value) {
        const hits = searchDocs(docs.value, query)
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
            .map((id) => ({ value: id, label: persons.value?.[id]?.name ?? id }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        places: uniq(c.flatMap((e) => e.places))
            .map((id) => ({ value: id, label: placeName(places.value?.[id]) }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        actions: uniq(c.flatMap((e) => e.actionTypes))
            .sort()
            .map((a) => ({ value: a, label: label(a) })),
    }
})
// highlighting: same matching rule as the search
const highlight = computed(() => (docs.value ? queryTerms(q("q")) : []))
const snippets = computed(() => {
    const terms = highlight.value
    if (!terms.length) return {}
    return Object.fromEntries(results.value.map((e) => [e.id, snippet(texts.value[e.id] ?? "", terms)]))
})
const active = computed(() => ["q", "person", "place", "action"].some((k) => q(k)))
</script>

<template>
    <div class="container">
        <div class="page-head">
            <h1>Charters</h1>
            <NuxtLink
                to="/charters"
                class="btn reset"
                :class="{ disabled: !active }"
                :aria-disabled="!active"
                :tabindex="active ? undefined : -1"
            >
                <RotateCcw :size="15" />Reset filters
            </NuxtLink>
        </div>
        <form class="filters" role="search" @submit.prevent>
            <label class="search-field">
                <Search :size="18" class="search-icon" />
                <input
                    v-model="text"
                    type="search"
                    placeholder="Search text, persons, places…"
                    aria-label="Full-text search"
                />
            </label>
            <div class="filter-row">
                <FilterSelect
                    :model-value="q('person')"
                    :options="options.persons"
                    all-label="All persons"
                    aria-label="Person"
                    @update:model-value="setQuery('person', $event)"
                />
                <FilterSelect
                    :model-value="q('place')"
                    :options="options.places"
                    all-label="All places"
                    aria-label="Place"
                    @update:model-value="setQuery('place', $event)"
                />
                <FilterSelect
                    :model-value="q('action')"
                    :options="options.actions"
                    all-label="All actions"
                    aria-label="Action"
                    @update:model-value="setQuery('action', $event)"
                />
            </div>
        </form>
        <p class="muted">{{ results.length }} of {{ catalog?.length ?? 0 }} charters</p>
        <CharterList :entries="results" :highlight="highlight" :snippets="snippets" />
    </div>
</template>
