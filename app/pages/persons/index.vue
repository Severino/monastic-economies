<script setup lang="ts">
import { CircleDashed, Mars, Venus } from "lucide-vue-next"
import { matchesAll, queryTerms } from "#shared/search"

useHead({ title: "Persons · Monastic Economies" })
const { data: persons } = await usePersons()
const route = useRoute()
const router = useRouter()
// same search box and matching rule as the charter catalog: every word, anywhere in a name
// (alternate spellings included), ignoring case and diacritics; typing only replaces the history entry
const q = () => (typeof route.query.q === "string" ? route.query.q : "")
const text = ref(q())
let t: ReturnType<typeof setTimeout> | undefined
watch(text, (v) => {
    clearTimeout(t)
    t = setTimeout(() => router.replace({ query: { ...route.query, q: v.trim() || undefined } }), 250)
})
watch(
    () => route.query.q,
    () => {
        if (q() !== text.value.trim()) text.value = q()
    },
)
const list = computed(() => {
    const terms = queryTerms(q())
    return Object.values(persons.value ?? {})
        .filter((p) => matchesAll([p.name, ...p.altNames].join(" "), terms))
        .sort((a, b) => a.name.localeCompare(b.name))
})
// group by first letter (diacritics folded, so "Ádalbert" goes under A)
const groups = computed(() => {
    const out = new Map<string, typeof list.value>()
    for (const p of list.value) {
        const k = p.name.normalize("NFD").replace(/\p{M}/gu, "").charAt(0).toUpperCase() || "#"
        if (!out.has(k)) out.set(k, [])
        out.get(k)!.push(p)
    }
    return [...out]
})
function sexIcon(s?: string) {
    const sex = sexOf(s)
    return sex === "male"
        ? { icon: Mars, label: "male" }
        : sex === "female"
          ? { icon: Venus, label: "female" }
          : { icon: CircleDashed, label: "sex unknown" }
}
</script>

<template>
    <div class="container">
        <h1>Persons</h1>
        <SearchField v-model="text" placeholder="Search persons…" label="Search persons" />
        <p class="muted">{{ list.length }} person{{ list.length === 1 ? "" : "s" }}</p>
        <nav v-if="groups.length > 1" class="letter-nav" aria-label="Jump to letter">
            <a v-for="[letter] in groups" :key="letter" :href="`#letter-${letter}`">{{ letter }}</a>
        </nav>
        <section v-for="[letter, items] in groups" :key="letter" class="letter-group">
            <h2 :id="`letter-${letter}`">{{ letter }}</h2>
            <ul class="person-list">
                <li v-for="p in items" :key="p.id">
                    <component
                        :is="sexIcon(p.sex).icon"
                        :size="15"
                        class="sex-icon"
                        :class="{ unknown: sexIcon(p.sex).label === 'sex unknown' }"
                        :aria-label="sexIcon(p.sex).label"
                        role="img"
                    />
                    <NuxtLink
                        :to="`/persons/${p.id}`"
                        :title="p.altNames.length ? `also: ${p.altNames.join(', ')}` : undefined"
                        >{{ p.name }}</NuxtLink
                    >
                    <span class="muted small">
                        {{ p.charters.length }} charter{{ p.charters.length === 1 ? "" : "s" }}</span
                    >
                </li>
            </ul>
        </section>
    </div>
</template>

<style lang="css" scoped>
a {
    text-decoration: none;
}
</style>
