<script setup lang="ts">
import type { CatalogEntry } from "#shared/types"
import { markParts, type TextPart } from "#shared/search"

const props = defineProps<{
    entries: CatalogEntry[]
    roles?: Record<string, string[]>
    /** matches of the current search, highlighted in title, issuers and snippet */
    highlight?: string[]
    snippets?: Record<string, { parts: TextPart[]; count: number } | null>
}>()
const { data: persons } = await usePersons()

const issuers = (e: CatalogEntry) => e.issuers.map((i) => persons.value?.[i]?.name ?? i).join(", ")
const mark = (s: string): TextPart[] => markParts(s, props.highlight ?? [])
</script>

<template>
    <ul class="charter-list">
        <li v-for="e in entries" :key="e.id">
            <NuxtLink :to="`/charters/${e.id}`" class="charter-card">
                <span class="date">{{ formatDate(e.date) || "–" }}</span>
                <span class="title-row">
                    <span class="title"
                        ><template v-for="(p, i) in mark(e.title)" :key="i"
                            ><mark v-if="p.hit">{{ p.text }}</mark
                            ><template v-else>{{ p.text }}</template></template
                        ></span
                    >
                    <span v-if="e.issuers.length || roles?.[e.id]?.length" class="issuer muted small"
                        ><template v-for="(p, i) in mark(issuers(e))" :key="i"
                            ><mark v-if="p.hit">{{ p.text }}</mark
                            ><template v-else>{{ p.text }}</template></template
                        ><template v-if="roles?.[e.id]?.length">
                            · as {{ roles[e.id]!.map(label).join(", ") }}</template
                        ></span
                    >
                </span>
                <span v-if="snippets?.[e.id]" class="snippet small"
                    ><template v-for="(p, i) in snippets[e.id]!.parts" :key="i"
                        ><mark v-if="p.hit">{{ p.text }}</mark
                        ><template v-else>{{ p.text }}</template></template
                    >
                    <span class="match-count"
                        >{{ snippets[e.id]!.count }} match{{ snippets[e.id]!.count === 1 ? "" : "es" }}</span
                    ></span
                >
                <span v-if="e.actionTypes.length" class="action-types">{{ e.actionTypes.map(label).join(" · ") }}</span>
            </NuxtLink>
        </li>
    </ul>
</template>
