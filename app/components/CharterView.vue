<script setup lang="ts">
// Self-contained view (loads its own data by id) so it can later be rendered
// as a route *or* as a layer of the page stack.
const props = defineProps<{ id: string }>()
const { data: charter, error } = await useCharter(() => props.id)
const { data: persons } = await usePersons()
const { data: places } = await usePlaces()
const { data: orgs } = await useOrgs()

const route = useRoute()
const router = useRouter()
const lines = computed({
  get: () => route.query.view !== 'running',
  set: (v) => router.replace({ query: { ...route.query, view: v ? undefined : 'running' } }),
})

const imageBase = useRuntimeConfig().public.imageBase
const broken = ref<Record<string, boolean>>({})
// images that failed before hydration never fire @error on the client
onMounted(() => {
  document.querySelectorAll<HTMLImageElement>('.facsimile img').forEach((img, i) => {
    const p = charter.value?.pages[i]
    if (p && img.complete && img.naturalWidth === 0) broken.value[p.id] = true
  })
})

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
const actionTypes = computed(() => [...new Set(charter.value?.actions.flatMap((a) => a.types) ?? [])])
</script>

<template>
  <div v-if="error" class="notice">Charter “{{ id }}” not found.</div>
  <article v-else-if="charter" class="split">
    <section class="pane facsimile" aria-label="Facsimile">
      <figure v-for="p in charter.pages" :key="p.id" class="page">
        <img
          :src="imageBase + p.image"
          :alt="`Facsimile page ${p.label}`"
          :class="{ failed: broken[p.id] }"
          @error="broken[p.id] = true"
        />
        <div v-if="broken[p.id]" class="img-missing">Image {{ p.image }} not available</div>
        <figcaption>fol. {{ p.label }}</figcaption>
      </figure>
    </section>

    <section class="pane transcript">
      <header class="charter-head">
        <p class="eyebrow">{{ charter.collection }} · {{ charter.bookId }} · no. {{ charter.number }}</p>
        <h1>{{ charter.title }}</h1>
        <dl class="meta">
          <div><dt>Date</dt><dd>{{ formatDate(charter.date) || '–' }}</dd></div>
          <div><dt>Folios</dt><dd>{{ charter.locus.from }} – {{ charter.locus.to }}</dd></div>
          <div><dt>Language</dt><dd>{{ charter.language }}</dd></div>
        </dl>
        <div v-if="actionTypes.length" class="chips">
          <NuxtLink v-for="t in actionTypes" :key="t" :to="{ path: '/charters', query: { action: t } }" class="chip action">
            {{ label(t) }}
          </NuxtLink>
        </div>
      </header>

      <div class="toolbar">
        <label><input v-model="lines" type="checkbox" /> Line breaks as in the manuscript</label>
      </div>

      <TeiText :charter="charter" :lines="lines" />

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
