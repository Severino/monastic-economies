<script setup lang="ts">
// Name and alternate spellings of highlighted persons, laid over their label in a diagram (see usePersonSigma).
defineProps<{ tips: { id: string; x: number; y: number; name: string; alt: string }[] }>()
</script>

<template>
    <div v-for="t in tips" :key="t.id" class="graph-tip" :style="{ left: `${t.x}px`, top: `${t.y}px` }">
        <strong>{{ t.name }}</strong>
        <span>{{ t.alt }}</span>
    </div>
</template>
