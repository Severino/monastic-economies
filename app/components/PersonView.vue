<script setup lang="ts">
const props = defineProps<{ id: string }>()
const { data: persons } = await usePersons()
const { data: catalog } = await useCatalog()

const person = computed(() => persons.value?.[props.id])
const roles = computed(() => Object.fromEntries(person.value?.charters.map((c) => [c.id, c.roles]) ?? []))
const entries = computed(() => (catalog.value ?? []).filter((e) => roles.value[e.id]))

// preview: ?preview=<charterId>, defaults to the first charter
const route = useRoute()
const router = useRouter()
const preview = computed(() => (route.query.preview as string) || entries.value[0]?.id)
const sexIcon: Record<string, string> = { m: '♂', male: '♂', f: '♀', female: '♀' }
</script>

<template>
    <div v-if="!person" class="notice">Person “{{ id }}” not found.</div>
    <article v-else class="split">
        <section class="pane">
            <p class="eyebrow">Person</p>
            <h1>
                <span v-if="person.sex" class="sex" :title="person.sex">{{ sexIcon[person.sex] ?? '' }}</span>
                {{ person.name }}
                <span v-if="person.roleName" class="muted">{{ person.roleName }}</span>
            </h1>
            <p v-if="person.altNames.length" class="muted">also: {{ person.altNames.join(', ') }}</p>
            <ul v-if="person.affiliations.length">
                <li v-for="(a, i) in person.affiliations" :key="i">{{ a.type }}: {{ a.label }}</li>
            </ul>
            <p v-if="person.socecStatus">Status: {{ person.socecStatus }}</p>
            <TeiNodes v-if="person.note" :nodes="person.note" />

            <h2>Charters ({{ entries.length }})</h2>
            <ul class="charter-list compact">
                <li v-for="e in entries" :key="e.id">
                    <a
                        href="#"
                        class="charter-card"
                        :class="{ selected: e.id === preview }"
                        @click.prevent="router.replace({ query: { ...route.query, preview: e.id } })"
                    >
                        <span class="date">{{ formatDate(e.date) }}</span>
                        <span class="title">{{ e.title }}</span>
                        <span class="muted small"
                            >as {{ roles[e.id]?.length ? roles[e.id]!.map(label).join(', ') : 'mentioned' }}</span
                        >
                    </a>
                </li>
            </ul>
            <NuxtLink :to="{ path: '/charters', query: { person: id } }">Show in catalog →</NuxtLink>
        </section>
        <section class="pane preview">
            <template v-if="preview">
                <NuxtLink :to="`/charters/${preview}`" class="open">Open charter →</NuxtLink>
                <CharterPreview :id="preview" />
            </template>
        </section>
    </article>
</template>
