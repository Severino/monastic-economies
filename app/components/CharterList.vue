<script setup lang="ts">
import type { CatalogEntry } from '#shared/types'

defineProps<{ entries: CatalogEntry[]; roles?: Record<string, string[]> }>()
const { data: persons } = await usePersons()
</script>

<template>
    <ul class="charter-list">
        <li v-for="e in entries" :key="e.id">
            <NuxtLink :to="`/charters/${e.id}`" class="charter-card">
                <span class="date">{{ formatDate(e.date) || '–' }}</span>
                <span class="title">{{ e.title }}</span>
                <span class="muted small">
                    <template v-if="e.issuers.length"
                        >Issuer: {{ e.issuers.map((i) => persons?.[i]?.name ?? i).join(', ') }}</template
                    >
                    <template v-if="roles?.[e.id]?.length"> · as {{ roles[e.id]!.map(label).join(', ') }}</template>
                </span>
                <span v-if="e.actionTypes.length" class="action-types">{{ e.actionTypes.map(label).join(' · ') }}</span>
            </NuxtLink>
        </li>
    </ul>
</template>
