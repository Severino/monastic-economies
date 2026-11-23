<script setup lang="ts">
// Transcript-only preview of a charter, used on person and place pages.
const props = defineProps<{ id: string }>()
const { data: charter } = await useCharter(() => props.id)
</script>

<template>
  <div v-if="charter" class="charter-preview">
    <h2>{{ charter.title }}</h2>
    <p class="muted">{{ formatDate(charter.date) }}</p>
    <TeiText :charter="charter" />
  </div>
</template>
