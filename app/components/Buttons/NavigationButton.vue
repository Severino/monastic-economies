<template>
    <NuxtLink :to="to" class="navigation-button">
        <div class="image">
            <img v-if="img" :src="img" />
        </div>
        <footer>
            <slot v-if="$slots.default" />
            <strong v-else>{{ text }}</strong>
        </footer>
    </NuxtLink>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router"

const props = defineProps<{
    img?: string
    to: RouteLocationRaw | undefined
    text?: string | undefined
    count: number
}>()
</script>

<style lang="css" scoped>
footer {
    padding: 0.5rem 1.2rem;
}

.navigation-button {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    text-decoration: none;
    color: var(--text);
}

.navigation-button strong {
    font-family: var(--font-text);
    font-size: 1.3rem;
    color: var(--accent);
}

.navigation-button span {
    color: var(--muted);
}

.navigation-button.disabled {
    opacity: 0.55;
}

.image {
    position: relative;
    background-color: var(--muted);
    aspect-ratio: 1/1;
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
    overflow: hidden;
}

.image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>
