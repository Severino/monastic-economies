<script setup lang="ts">
// Self-contained view (loads its own data by id) so it can later be rendered
// as a route *or* as a layer of the page stack.
const props = defineProps<{ id: string }>()
const { data: charter, error } = await useCharter(() => props.id)
const { data: persons } = await usePersons()
const { data: places } = await usePlaces()
const { data: orgs } = await useOrgs()
const { toggle, isOn } = useLegend()

const route = useRoute()
const router = useRouter()
const replaceQuery = (q: Record<string, string | undefined>) => router.replace({ query: { ...route.query, ...q } })

// ---- line breaks (URL: ?view=running) ------------------------------------------
const lines = computed({
  get: () => route.query.view !== 'running',
  set: (v) => replaceQuery({ view: v ? undefined : 'running' }),
})

// ---- facsimile page (URL: ?page=3r), synced with the transcript scroll ---------
const transcript = ref<HTMLElement>()
const head = ref<HTMLElement>()
const currentPage = computed({
  get: () => (route.query.page as string) || charter.value?.pages[0]?.label,
  set: (v) => {
    if (v !== currentPage.value) replaceQuery({ page: v === charter.value?.pages[0]?.label ? undefined : v })
  },
})

function selectPage(label: string) {
  currentPage.value = label
  const pb = transcript.value?.querySelector<HTMLElement>(`.tei-pb[data-page="${CSS.escape(label)}"]`)
  const first = charter.value?.pages[0]?.label === label
  if (pb && !first) pb.scrollIntoView({ block: 'start' })
  else if (first) {
    transcript.value?.scrollTo({ top: 0 })
    if (window.matchMedia('(max-width: 899px)').matches) window.scrollTo({ top: 0 })
  }
}

let raf = 0
function syncPage() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    const pane = transcript.value
    const pages = charter.value?.pages ?? []
    if (!pane || pages.length < 2) return
    const known = new Set(pages.map((p) => p.label))
    const headBottom = head.value?.getBoundingClientRect().bottom ?? 0
    const line = headBottom + (window.innerHeight - headBottom) * 0.35
    let label = pages[0]!.label
    for (const pb of pane.querySelectorAll<HTMLElement>('.tei-pb[data-page]')) {
      if (pb.getBoundingClientRect().top > line) break
      if (known.has(pb.dataset.page!)) label = pb.dataset.page!
    }
    currentPage.value = label
  })
}

// ---- action highlighting --------------------------------------------------------
const actionTypes = computed(() => [...new Set(charter.value?.actions.flatMap((a) => a.types) ?? [])])
const hoverTypes = ref<string[]>([])
const current = ref<{ type?: string; el: HTMLElement; index: number } | null>(null)
let hoverEl: HTMLElement | null = null

const typesOf = (el: HTMLElement) => (el.dataset.types ?? '').split(/\s+/).filter(Boolean)
const badgeLit = (t: string) => hoverTypes.value.includes(t) || current.value?.type === t ||
  (!current.value?.type && current.value && typesOf(current.value.el).includes(t))

function setCurrent(next: typeof current.value) {
  current.value?.el.classList.remove('is-current')
  current.value = next
  next?.el.classList.add('is-current')
}

/** Badge click: jump to the next occurrence of this action type. */
function nextOccurrence(t: string) {
  const all = [...(transcript.value?.querySelectorAll<HTMLElement>('.tei-action') ?? [])].filter((el) =>
    typesOf(el).includes(t),
  )
  if (!all.length) return
  const index = current.value?.type === t ? (current.value.index + 1) % all.length : 0
  const el = all[index]!
  setCurrent({ type: t, el, index })
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function onTextOver(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.tei-action')
  if (el === hoverEl) return
  hoverEl?.classList.remove('is-hover')
  hoverEl = el
  el?.classList.add('is-hover')
  hoverTypes.value = el ? typesOf(el) : []
}
function onTextLeave() {
  hoverEl?.classList.remove('is-hover')
  hoverEl = null
  hoverTypes.value = []
}
function onTextClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const pb = target.closest<HTMLElement>('.tei-pb[data-page]')
  if (pb) return selectPage(pb.dataset.page!)
  if (target.closest('a')) return
  // tap on an action (mobile): pin it, tap again elsewhere to clear
  const el = target.closest<HTMLElement>('.tei-action')
  setCurrent(el && el !== current.value?.el ? { el, index: -1 } : null)
}
function onTextKey(e: KeyboardEvent) {
  const pb = (e.target as HTMLElement).closest<HTMLElement>('.tei-pb[data-page]')
  if (pb && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault()
    selectPage(pb.dataset.page!)
  }
}
// any other click clears a pinned occurrence
function onDocClick(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (!t.closest('.action-badge') && !t.closest('.tei-text')) setCurrent(null)
}

/** CSS for "highlight all spans of the hovered badge type" (data-types is a token list). */
const hoverCss = computed(() =>
  hoverTypes.value.length && !hoverEl
    ? hoverTypes.value.map((t) => `.tei-action[data-types~="${CSS.escape(t)}"]`).join(',') + '{background:var(--hl)}'
    : '',
)

onMounted(() => {
  transcript.value?.addEventListener('scroll', syncPage, { passive: true })
  window.addEventListener('scroll', syncPage, { passive: true })
  document.addEventListener('click', onDocClick)
  syncPage()
})
onBeforeUnmount(() => {
  transcript.value?.removeEventListener('scroll', syncPage)
  window.removeEventListener('scroll', syncPage)
  document.removeEventListener('click', onDocClick)
})
watch(() => props.id, () => setCurrent(null))

// ---- entity lists ---------------------------------------------------------------
const entities = computed(() => {
  const c = charter.value
  if (!c) return { persons: [], places: [], orgs: [] }
  const group = (kind: string) => {
    const m = new Map<string, Set<string>>()
    for (const x of c.mentions.filter((x) => x.kind === kind)) {
      if (!m.has(x.ref)) m.set(x.ref, new Set())
      if (x.role) m.get(x.ref)!.add(x.role)
    }
    return [...m].map(([id, roles]) => ({ id, roles: [...roles] }))
  }
  return { persons: group('person'), places: group('place'), orgs: group('org') }
})
</script>

<template>
  <div v-if="error" class="notice">Charter “{{ id }}” not found.</div>
  <article v-else-if="charter" class="split charter-view">
    <section class="pane facsimile" aria-label="Facsimile">
      <FacsimileViewer :pages="charter.pages" :current="currentPage" @select="selectPage" />
    </section>

    <section ref="transcript" class="pane transcript">
      <header ref="head" class="charter-head">
        <p class="eyebrow">{{ charter.collection }} · {{ charter.bookId }} · no. {{ charter.number }}</p>
        <h1>{{ charter.title }}</h1>
        <dl class="meta">
          <div><dt>Date</dt><dd>{{ formatDate(charter.date) || '–' }}</dd></div>
          <div><dt>Folios</dt><dd>{{ charter.locus.from }} – {{ charter.locus.to }}</dd></div>
          <div><dt>Language</dt><dd>{{ charter.language }}</dd></div>
        </dl>
        <div v-if="actionTypes.length" class="action-badges" aria-label="Actions in this charter">
          <button
            v-for="t in actionTypes"
            :key="t"
            type="button"
            class="action-badge"
            :class="{ lit: badgeLit(t) }"
            :title="`Jump to the next “${label(t)}”`"
            @mouseenter="hoverTypes = [t]"
            @mouseleave="hoverTypes = []"
            @click="nextOccurrence(t)"
          >
            {{ label(t) }}
          </button>
        </div>
        <div class="legend" role="group" aria-label="Highlighting">
          <button
            v-for="l in LEGEND"
            :key="l.key"
            type="button"
            class="legend-item"
            :class="[`legend-${l.key}`, { off: !isOn(l.key) }]"
            :aria-pressed="isOn(l.key)"
            @click="toggle(l.key)"
          >
            <span class="swatch" aria-hidden="true" />{{ l.label }}
          </button>
          <button
            type="button"
            class="legend-item line-toggle"
            :class="{ off: !lines }"
            :aria-pressed="lines"
            :title="lines ? 'Line breaks as in the manuscript' : 'Running text'"
            @click="lines = !lines"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M2 3.5h12M2 8h9a2.5 2.5 0 0 1 0 5H7m0 0 1.8-1.8M7 13l1.8 1.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Line breaks
          </button>
        </div>
      </header>

      <component :is="'style'" v-if="hoverCss">{{ hoverCss }}</component>
      <div @mouseover="onTextOver" @mouseleave="onTextLeave" @click="onTextClick" @keydown="onTextKey">
        <TeiText :charter="charter" :lines="lines" />
      </div>

      <section class="entities">
        <div v-if="entities.persons.length">
          <h2>Persons</h2>
          <ul>
            <li v-for="p in entities.persons" :key="p.id">
              <NuxtLink :to="`/persons/${p.id}`">{{ persons?.[p.id]?.name ?? p.id }}</NuxtLink>
              <span v-if="p.roles.length" class="muted"> · {{ p.roles.map(label).join(', ') }}</span>
            </li>
          </ul>
        </div>
        <div v-if="entities.places.length">
          <h2>Places</h2>
          <ul>
            <li v-for="p in entities.places" :key="p.id">
              <NuxtLink :to="`/places/${p.id}`">{{ placeName(places?.[p.id]) }}</NuxtLink>
              <span v-if="p.roles.length" class="muted"> · {{ p.roles.map(label).join(', ') }}</span>
            </li>
          </ul>
        </div>
        <div v-if="entities.orgs.length">
          <h2>Organisations</h2>
          <ul>
            <li v-for="o in entities.orgs" :key="o.id">
              {{ orgName(orgs?.[o.id]) }}
              <span v-if="o.roles.length" class="muted"> · {{ o.roles.map(label).join(', ') }}</span>
            </li>
          </ul>
        </div>
      </section>
    </section>
  </article>
</template>
