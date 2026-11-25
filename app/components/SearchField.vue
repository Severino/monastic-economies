<script setup lang="ts">
import { Search } from "lucide-vue-next"

// Search box with a magnifier icon, full width. Used by the charter catalog and the persons list.
const model = defineModel<string>({ required: true })
defineProps<{ placeholder?: string; label: string }>()
</script>

<template>
    <label class="search-field">
        <Search :size="18" class="search-icon" />
        <input v-model="model" type="search" :placeholder="placeholder" :aria-label="label" />
    </label>
</template>
