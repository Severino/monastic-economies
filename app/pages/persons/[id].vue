<script setup lang="ts">
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: persons } = await usePersons()
useHead({ title: () => `${persons.value?.[id.value]?.name ?? id.value} · Monastic Economies` })
</script>

<template>
  <PersonView :id="id" />
</template>
