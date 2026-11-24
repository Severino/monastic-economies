<script setup lang="ts">
import { CircleDashed, Mars, Venus } from "lucide-vue-next"

useHead({ title: "Persons · Monastic Economies" })
const { data: persons } = await usePersons()
const route = useRoute()
const router = useRouter()
const filter = computed({
    get: () => (route.query.q as string) ?? "",
    set: (v) => router.replace({ query: { q: v || undefined } }),
})
const list = computed(() =>
    Object.values(persons.value ?? {})
        .filter((p) => p.name.toLowerCase().includes(filter.value.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
)
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
// TEI @sex: ISO 5218 numbers (1 male, 2 female) or letters/words
function sexOf(s?: string) {
    const v = s?.trim().toLowerCase()
    if (v === "1" || v === "m" || v === "male") return { icon: Mars, label: "male" }
    if (v === "2" || v === "f" || v === "female") return { icon: Venus, label: "female" }
    return { icon: CircleDashed, label: "sex unknown" }
}
</script>

<template>
    <div class="container">
        <h1>Persons</h1>
        <input
            v-model="filter"
            type="search"
            placeholder="Filter by name…"
            aria-label="Filter persons"
            class="wide"
        />
        <p class="muted">{{ list.length }} persons</p>
        <nav
            v-if="groups.length > 1"
            class="letter-nav"
            aria-label="Jump to letter"
        >
            <a
                v-for="[letter] in groups"
                :key="letter"
                :href="`#letter-${letter}`"
            >{{ letter }}</a>
        </nav>
        <section
            v-for="[letter, items] in groups"
            :key="letter"
            class="letter-group"
        >
            <h2 :id="`letter-${letter}`">{{ letter }}</h2>
            <ul class="person-list">
                <li
                    v-for="p in items"
                    :key="p.id"
                >
                    <component
                        :is="sexOf(p.sex).icon"
                        :size="15"
                        class="sex-icon"
                        :class="{ unknown: sexOf(p.sex).label === 'sex unknown' }"
                        :aria-label="sexOf(p.sex).label"
                        role="img"
                    />
                    <NuxtLink :to="`/persons/${p.id}`">{{ p.name }}</NuxtLink>
                    <span class="muted small">
                        {{ p.charters.length }} charter{{ p.charters.length === 1 ? "" : "s" }}</span>
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