<script setup lang="ts">
import { Moon, Sun } from "lucide-vue-next"

// Default: system preference. A click switches to the other theme and stores
// it; the stored choice is applied before the first paint (see nuxt.config).
const STORAGE_KEY = "monastic-economies:theme"
const dark = ref(false)

let media: MediaQueryList | undefined
function systemDark() {
    return media?.matches ?? false
}
function sync() {
    const forced = document.documentElement.dataset.theme
    dark.value = forced ? forced === "dark" : systemDark()
}

function toggle() {
    const next = dark.value ? "light" : "dark"
    document.documentElement.dataset.theme = next
    try {
        localStorage.setItem(STORAGE_KEY, next)
    } catch {
        /* storage unavailable: still switch for this visit */
    }
    sync()
}

onMounted(() => {
    media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", sync)
    sync()
})
onBeforeUnmount(() => media?.removeEventListener("change", sync))
</script>

<template>
    <button
        type="button"
        class="icon-btn theme-toggle"
        :aria-label="dark ? 'Switch to light mode' : 'Switch to dark mode'"
        :title="dark ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggle"
    >
        <Sun v-if="dark" :size="18" aria-hidden="true" />
        <Moon v-else :size="18" aria-hidden="true" />
    </button>
</template>
