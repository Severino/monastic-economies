<script setup lang="ts">
useHead({ title: 'Persons · Monastic Economies' })
const { data: persons } = await usePersons()
const route = useRoute()
const router = useRouter()
const filter = computed({
    get: () => (route.query.q as string) ?? '',
    set: (v) => router.replace({ query: { q: v || undefined } }),
})
const list = computed(() =>
    Object.values(persons.value ?? {})
        .filter((p) => p.name.toLowerCase().includes(filter.value.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
)
</script>

<template>
    <div class="container">
        <h1>Persons</h1>
        <input v-model="filter" type="search" placeholder="Filter by name…" aria-label="Filter persons" class="wide" />
        <p class="muted">{{ list.length }} persons</p>
        <ul class="grid-list">
            <li v-for="p in list" :key="p.id">
                <NuxtLink :to="`/persons/${p.id}`">{{ p.name }}</NuxtLink>
                <span class="muted small">
                    · {{ p.charters.length }} charter{{ p.charters.length === 1 ? '' : 's' }}</span
                >
            </li>
        </ul>
    </div>
</template>
