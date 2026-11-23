<script setup lang="ts">
import type { PageRef } from "#shared/types"

// Shows one page at a time, filling the pane. With several pages a pager at
// the bottom switches between them (also with ←/→ while it has focus).
const props = defineProps<{ pages: PageRef[]; current?: string }>()
const emit = defineEmits<{ select: [label: string] }>()

const imageBase = useRuntimeConfig().public.imageBase
const broken = ref<Record<string, boolean>>({})
const page = computed(() => props.pages.find((p) => p.label === props.current) ?? props.pages[0])
const index = computed(() => (page.value ? props.pages.indexOf(page.value) : -1))

function go(delta: number) {
    const next = props.pages[index.value + delta]
    if (next) emit("select", next.label)
}

// an image that failed before hydration never fires @error on the client
const img = ref<HTMLImageElement>()
function checkImage() {
    const el = img.value
    if (el && page.value && el.complete && el.naturalWidth === 0) broken.value[page.value.id] = true
}
onMounted(checkImage)
watch(page, () => nextTick(checkImage))
</script>

<template>
    <div class="facsimile-viewer">
        <div v-if="page" class="facsimile-stage">
            <img
                v-show="!broken[page.id]"
                ref="img"
                :key="page.id"
                :src="imageBase + page.image"
                :alt="`Facsimile, fol. ${page.label}`"
                @error="broken[page.id] = true"
            />
            <div v-if="broken[page.id]" class="img-missing">
                <span>fol. {{ page.label }}</span>
                <small>Image {{ page.image }} not available</small>
            </div>
        </div>
        <div v-else class="img-missing"><small>No facsimile</small></div>

        <nav
            v-if="pages.length > 1"
            class="pager"
            aria-label="Facsimile pages"
            tabindex="0"
            @keydown.left.prevent="go(-1)"
            @keydown.right.prevent="go(1)"
        >
            <button
                v-for="p in pages"
                :key="p.id"
                type="button"
                class="pager-page"
                :class="{ active: p.id === page?.id }"
                :aria-current="p.id === page?.id ? 'page' : undefined"
                tabindex="-1"
                @click="emit('select', p.label)"
            >
                {{ p.label }}
            </button>
        </nav>
    </div>
</template>
