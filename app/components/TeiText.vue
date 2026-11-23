<script setup lang="ts">
import type { Charter, EntityKind } from '#shared/types'
import { TEI_CONTEXT } from './TeiNodes'

const props = defineProps<{ charter: Charter; lines?: boolean }>()

const kinds = computed(() => {
  const k: Record<string, EntityKind> = {}
  for (const m of props.charter.mentions) k[m.ref] = m.kind
  return k
})
const noteIds = computed(() => Object.keys(props.charter.notes))

provide(
  TEI_CONTEXT,
  reactive({
    kinds,
    notes: noteIds,
    lines: computed(() => props.lines ?? true),
  }),
)
</script>

<template>
  <div class="tei-text" :class="{ 'tei-running': !lines }">
    <TeiNodes :nodes="charter.body" />
    <ol v-if="noteIds.length" class="tei-notes">
      <li v-for="id in noteIds" :id="`note-${id}`" :key="id">
        <TeiNodes :nodes="charter.notes[id]!" />
        <a :href="`#anchor-${id}`" class="back" aria-label="back to text">↩</a>
      </li>
    </ol>
  </div>
</template>
