<script setup lang="ts">
const route = useRoute()
const id = computed(() => String(route.params.id))
useHead({ title: () => `Charter ${id.value} · Monastic Economies` })
</script>

<template>
  <CharterView :id="id" />
</template>
