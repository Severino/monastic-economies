<script setup lang="ts">
const props = defineProps<{ id: string }>()
const { data: places } = await usePlaces()
const { data: catalog } = await useCatalog()

const place = computed(() => places.value?.[props.id])
const roles = computed(() => Object.fromEntries(place.value?.charters.map((c) => [c.id, c.roles]) ?? []))
const entries = computed(() => (catalog.value ?? []).filter((e) => roles.value[e.id]))
</script>

<template>
    <div v-if="!place" class="notice">Place “{{ id }}” not found.</div>
    <article v-else class="container">
        <p class="eyebrow">
            Place<template v-if="place.types.length"> · {{ place.types.join(", ") }}</template>
        </p>
        <h1>{{ placeName(place) }}</h1>
        <p v-if="place.names.length > 1" class="muted">
            also:
            {{
                place.names
                    .slice(1)
                    .map((n) => n.name + (n.lang ? ` (${n.lang})` : ""))
                    .join(", ")
            }}
        </p>
        <p v-if="place.coords" class="muted">
            {{ place.coords[1].toFixed(4) }}, {{ place.coords[0].toFixed(4) }}
            <template v-if="place.cert"> · certainty: {{ place.cert }}</template>
        </p>
        <p v-else class="muted">No coordinates.</p>
        <h2>Charters ({{ entries.length }})</h2>
        <CharterList :entries="entries" :roles="roles" />
    </article>
</template>
