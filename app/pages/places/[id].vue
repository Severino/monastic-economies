<script setup lang="ts">
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: places } = await usePlaces()
useHead({ title: () => `${placeName(places.value?.[id.value])} · Monastic Economies` })
</script>

<template>
    <PlaceView :id="id" />
</template>
