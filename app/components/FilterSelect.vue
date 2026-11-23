<script setup lang="ts">
// Select with a text filter: a button opens a popover with a search box and the matching options.
import { Check, ChevronDown } from "lucide-vue-next"
import { fold, markParts, queryTerms } from "#shared/search"

export interface FilterOption {
    value: string
    label: string
}

const props = defineProps<{
    modelValue: string
    options: FilterOption[]
    /** label of the empty value, e.g. "All persons" */
    allLabel: string
    ariaLabel: string
}>()
const emit = defineEmits<{ "update:modelValue": [value: string] }>()

const open = ref(false)
const query = ref("")
const active = ref(0)
const root = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const list = ref<HTMLElement>()
const id = useId()

const current = computed(() => props.options.find((o) => o.value === props.modelValue))
const terms = computed(() => queryTerms(query.value))
// the "all" entry stays first while nothing is typed
const items = computed<FilterOption[]>(() => {
    const t = terms.value
    if (!t.length) return [{ value: "", label: props.allLabel }, ...props.options]
    return props.options.filter((o) => t.every((x) => fold(o.label).includes(x)))
})

async function show() {
    open.value = true
    query.value = ""
    active.value = Math.max(
        0,
        items.value.findIndex((o) => o.value === props.modelValue),
    )
    await nextTick()
    input.value?.focus()
    scrollToActive()
}
function hide(focusButton = false) {
    open.value = false
    if (focusButton) root.value?.querySelector<HTMLButtonElement>(".fs-button")?.focus()
}
function choose(o: FilterOption | undefined) {
    if (!o) return
    if (o.value !== props.modelValue) emit("update:modelValue", o.value)
    hide(true)
}
function scrollToActive() {
    list.value?.children[active.value]?.scrollIntoView({ block: "nearest" })
}
function move(d: number) {
    const n = items.value.length
    if (!n) return
    active.value = (active.value + d + n) % n
    nextTick(scrollToActive)
}
watch(query, () => (active.value = 0))

function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") move(1)
    else if (e.key === "ArrowUp") move(-1)
    else if (e.key === "Enter") choose(items.value[active.value])
    else if (e.key === "Escape") hide(true)
    else if (e.key === "Tab") hide()
    else return
    e.preventDefault()
}

// close when clicking or focusing outside
function onOutside(e: Event) {
    if (open.value && !root.value?.contains(e.target as Node)) hide()
}
onMounted(() => {
    document.addEventListener("pointerdown", onOutside)
    document.addEventListener("focusin", onOutside)
})
onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", onOutside)
    document.removeEventListener("focusin", onOutside)
})
</script>

<template>
    <div ref="root" class="filter-select" :class="{ open, set: !!modelValue }">
        <button
            type="button"
            class="fs-button"
            :aria-label="ariaLabel"
            aria-haspopup="listbox"
            :aria-expanded="open"
            @click="open ? hide() : show()"
            @keydown.down.prevent="show()"
        >
            <span class="fs-value">{{ current?.label ?? allLabel }}</span>
            <ChevronDown :size="16" class="fs-chevron" />
        </button>
        <div v-if="open" class="fs-popover">
            <input
                ref="input"
                v-model="query"
                type="search"
                class="fs-input"
                :placeholder="`Filter ${ariaLabel.toLowerCase()}s…`"
                role="combobox"
                aria-autocomplete="list"
                :aria-controls="`${id}-list`"
                :aria-activedescendant="items.length ? `${id}-opt-${active}` : undefined"
                @keydown="onKey"
            />
            <ul :id="`${id}-list`" ref="list" class="fs-list" role="listbox" :aria-label="ariaLabel">
                <li
                    v-for="(o, i) in items"
                    :id="`${id}-opt-${i}`"
                    :key="o.value"
                    role="option"
                    :aria-selected="o.value === modelValue"
                    :class="{ active: i === active, all: !o.value }"
                    @pointerenter="active = i"
                    @click="choose(o)"
                >
                    <Check v-if="o.value === modelValue" :size="14" class="fs-check" />
                    <span v-else class="fs-check" />
                    <span
                        ><template v-for="(p, j) in markParts(o.label, terms)" :key="j"
                            ><mark v-if="p.hit">{{ p.text }}</mark
                            ><template v-else>{{ p.text }}</template></template
                        ></span
                    >
                </li>
                <li v-if="!items.length" class="fs-empty" role="presentation">No matches</li>
            </ul>
        </div>
    </div>
</template>
