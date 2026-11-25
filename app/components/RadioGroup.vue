<script setup lang="ts" generic="T extends string | number">
import type { Component } from "vue"

// Segmented radio group (one option selected), e.g. the view switch or the steps of the person graph.
// Keyboard: arrow keys move the selection, as in a native radio group (one tab stop).
interface RadioOption<V> {
    value: V
    label?: string
    icon?: Component
    /** tooltip (also the accessible name when there is no label) */
    title?: string
}
const props = defineProps<{ options: RadioOption<T>[]; label: string }>()
const model = defineModel<T>({ required: true })

const buttons = ref<HTMLButtonElement[]>([])
function move(from: number, by: number) {
    const i = (from + by + props.options.length) % props.options.length
    model.value = props.options[i]!.value
    buttons.value[i]?.focus()
}
</script>

<template>
    <div class="view-switch" role="radiogroup" :aria-label="label">
        <button
            v-for="(o, i) in options"
            :key="o.value"
            ref="buttons"
            type="button"
            role="radio"
            :class="{ active: o.value === model }"
            :aria-checked="o.value === model"
            :aria-label="o.label ? undefined : o.title"
            :title="o.title"
            :tabindex="o.value === model ? 0 : -1"
            @click="model = o.value"
            @keydown.right.prevent="move(i, 1)"
            @keydown.down.prevent="move(i, 1)"
            @keydown.left.prevent="move(i, -1)"
            @keydown.up.prevent="move(i, -1)"
        >
            <component :is="o.icon" v-if="o.icon" :size="16" />
            <template v-if="o.label">{{ o.label }}</template>
        </button>
    </div>
</template>
