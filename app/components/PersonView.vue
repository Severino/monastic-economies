<script setup lang="ts">
import { Eye, EyeOff, Link2Off, List, Share2 } from "lucide-vue-next"
import type { EgoNeighbor } from "~/composables/useEgoNetwork"

const props = defineProps<{ id: string }>()
const { data: persons } = await usePersons()
const { data: catalog } = await useCatalog()

const person = computed(() => persons.value?.[props.id])
const roles = computed(() => Object.fromEntries(person.value?.charters.map((c) => [c.id, c.roles]) ?? []))
const entries = computed(() => (catalog.value ?? []).filter((e) => roles.value[e.id]))

// preview: ?preview=<charterId>, defaults to the first charter
const route = useRoute()
const router = useRouter()
const preview = computed(() => (route.query.preview as string) || entries.value[0]?.id)
// ---- Charters | Graph (URL: ?view=graph) ---------------------------------------
const view = computed(() => (route.query.view === "graph" ? "graph" : "charters"))
const setView = (v: string) => router.push({ query: { ...route.query, view: v === "graph" ? "graph" : undefined } })

const { data: neighbors } = await useEgoNetwork(() => props.id)
const nameOf = (id: string) => persons.value?.[id]?.name ?? id
const altOf = (id: string) => {
    const alt = persons.value?.[id]?.altNames ?? []
    return alt.length ? `also: ${alt.join(", ")}` : undefined
}
const hovered = ref<string>()

// steps from the centre person (URL: ?depth=2), 1–5
const MAX_DEPTH = 5
const depth = computed(() => Math.min(MAX_DEPTH, Math.max(1, Number(route.query.depth) || 1)))
const setDepth = (d: number) => router.push({ query: { ...route.query, depth: d > 1 ? String(d) : undefined } })
// persons switched off in the graph (URL: ?hide=a,b), kept when moving to another person
const hidden = computed(() =>
    String(route.query.hide ?? "")
        .split(",")
        .filter(Boolean),
)
const setHidden = (ids: string[]) =>
    router.push({ query: { ...route.query, hide: ids.length ? ids.join(",") : undefined } })
const toggleHidden = (id: string) =>
    setHidden(hidden.value.includes(id) ? hidden.value.filter((h) => h !== id) : [...hidden.value, id])
// only explicit relations (URL: ?unrelated=hide): persons that just share charters are left out
const hideUnrelated = computed(() => route.query.unrelated === "hide")
const toggleUnrelated = () =>
    router.push({ query: { ...route.query, unrelated: hideUnrelated.value ? undefined : "hide" } })
const graphQuery = computed(() => ({
    view: "graph",
    depth: depth.value > 1 ? String(depth.value) : undefined,
    hide: hidden.value.filter((h) => h !== props.id).join(",") || undefined,
    unrelated: hideUnrelated.value ? "hide" : undefined,
}))
function openPerson(id: string, newTab = false) {
    const to = { path: `/persons/${id}`, query: graphQuery.value }
    if (newTab) window.open(router.resolve(to).href, "_blank")
    else router.push(to)
}
// list next to the graph: RELATED (explicit relation), UNRELATED (only shared charters), HIDDEN
const byCharters = (a: EgoNeighbor, b: EgoNeighbor) =>
    b.charters.length - a.charters.length || nameOf(a.id).localeCompare(nameOf(b.id))
const sections = computed(() => {
    const all = neighbors.value ?? []
    const visible = all.filter((n) => !hidden.value.includes(n.id))
    const byId = new Map(all.map((n) => [n.id, n]))
    return {
        related: visible.filter((n) => n.relations.length).sort(byCharters),
        unrelated: visible.filter((n) => !n.relations.length).sort(byCharters),
        // hidden persons can be further away than one step, so they are not always neighbours
        hidden: hidden.value
            .filter((h) => h !== props.id)
            .map((h) => byId.get(h) ?? { id: h, charters: [], relations: [] })
            .sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id))),
    }
})
const stepCounts = ref<number[]>([])
const shown = computed(() => stepCounts.value.reduce((a, b) => a + b, 0))

const sexIcon = (s?: string) => {
    const sex = sexOf(s)
    return sex === "male" ? "♂" : sex === "female" ? "♀" : ""
}
</script>

<template>
    <div v-if="!person" class="notice">Person “{{ id }}” not found.</div>
    <article v-else class="split">
        <section class="pane">
            <p class="eyebrow">Person</p>
            <h1>
                <span v-if="sexIcon(person.sex)" class="sex" :title="sexOf(person.sex)">{{ sexIcon(person.sex) }}</span>
                <span :title="altOf(person.id)">{{ person.name }}</span>
                <span v-if="person.roleName" class="muted">{{ person.roleName }}</span>
            </h1>
            <ul v-if="person.affiliations.length">
                <li v-for="(a, i) in person.affiliations" :key="i">{{ a.type }}: {{ a.label }}</li>
            </ul>
            <p v-if="person.socecStatus">Status: {{ person.socecStatus }}</p>
            <TeiNodes v-if="person.note" :nodes="person.note" />

            <div class="view-switch" role="group" aria-label="View">
                <button type="button" :class="{ active: view === 'charters' }" @click="setView('charters')">
                    <List :size="16" /> Charters ({{ entries.length }})
                </button>
                <button type="button" :class="{ active: view === 'graph' }" @click="setView('graph')">
                    <Share2 :size="16" /> Graph ({{ neighbors?.length ?? 0 }})
                </button>
            </div>

            <template v-if="view === 'graph'">
                <p v-if="!neighbors?.length" class="muted">No connections to other persons.</p>
                <template v-else>
                    <template
                        v-for="sec in [
                            { key: 'related', title: 'Related', items: sections.related },
                            { key: 'unrelated', title: 'Unrelated', items: sections.unrelated },
                            { key: 'hidden', title: 'Hidden', items: sections.hidden },
                        ]"
                        :key="sec.key"
                    >
                        <h2 v-if="sec.items.length" class="neighbor-heading">
                            {{ sec.title }}
                            <span class="count">{{ sec.items.length }}</span>
                            <span v-if="sec.key === 'unrelated' && hideUnrelated" class="note">hidden in graph</span>
                            <button
                                v-if="sec.key === 'hidden'"
                                type="button"
                                class="link-btn small"
                                @click="setHidden([])"
                            >
                                Show all
                            </button>
                        </h2>
                        <ul v-if="sec.items.length" class="neighbor-list">
                            <li
                                v-for="n in sec.items"
                                :key="n.id"
                                class="neighbor-row"
                                :class="{
                                    selected: n.id === hovered,
                                    off: sec.key === 'hidden' || (sec.key === 'unrelated' && hideUnrelated),
                                }"
                                @mouseenter="hovered = n.id"
                                @mouseleave="hovered = undefined"
                            >
                                <button
                                    type="button"
                                    class="eye"
                                    :title="sec.key === 'hidden' ? 'Show in graph' : 'Hide in graph'"
                                    :aria-pressed="sec.key !== 'hidden'"
                                    @click="toggleHidden(n.id)"
                                >
                                    <EyeOff v-if="sec.key === 'hidden'" :size="16" />
                                    <Eye v-else :size="16" />
                                </button>
                                <NuxtLink :to="{ path: `/persons/${n.id}`, query: graphQuery }" class="neighbor">
                                    <span class="name" :class="sexOf(persons?.[n.id]?.sex)" :title="altOf(n.id)">{{
                                        nameOf(n.id)
                                    }}</span>
                                    <span v-if="n.relations.length" class="relations">{{
                                        n.relations.map(relationLabel).join(", ")
                                    }}</span>
                                    <span v-if="n.charters.length" class="muted small"
                                        >{{ n.charters.length }} shared charter{{
                                            n.charters.length === 1 ? "" : "s"
                                        }}</span
                                    >
                                </NuxtLink>
                            </li>
                        </ul>
                    </template>
                </template>
            </template>
            <template v-else>
                <ul class="charter-list compact">
                    <li v-for="e in entries" :key="e.id">
                        <a
                            href="#"
                            class="charter-card"
                            :class="{ selected: e.id === preview }"
                            @click.prevent="router.replace({ query: { ...route.query, preview: e.id } })"
                        >
                            <span class="date">{{ formatDate(e.date) }}</span>
                            <span class="title">{{ e.title }}</span>
                            <span class="muted small"
                                >as {{ roles[e.id]?.length ? roles[e.id]!.map(label).join(", ") : "mentioned" }}</span
                            >
                        </a>
                    </li>
                </ul>
                <NuxtLink :to="{ path: '/charters', query: { person: id } }">Show in catalog →</NuxtLink>
            </template>
        </section>
        <section v-if="view === 'graph'" class="pane graph-pane">
            <div class="graph-toolbar">
                <span class="muted small">Steps</span>
                <div class="view-switch depth-switch" role="group" aria-label="Steps from this person">
                    <button
                        v-for="d in MAX_DEPTH"
                        :key="d"
                        type="button"
                        :class="{ active: d === depth }"
                        :aria-pressed="d === depth"
                        @click="setDepth(d)"
                    >
                        {{ d }}
                    </button>
                </div>
                <span class="muted small">{{ shown }} person{{ shown === 1 ? "" : "s" }}</span>
                <button
                    type="button"
                    class="toggle-btn"
                    :class="{ off: !hideUnrelated }"
                    :aria-pressed="hideUnrelated"
                    title="Hide persons that only share charters and have no explicit relation"
                    @click="toggleUnrelated"
                >
                    <Link2Off :size="16" /> Hide unrelated
                </button>
            </div>
            <ClientOnly>
                <PersonGraph
                    :id="id"
                    :persons="persons ?? {}"
                    :depth="depth"
                    :highlight="hovered"
                    :hidden="hidden"
                    :hide-unrelated="hideUnrelated"
                    @hover="hovered = $event"
                    @select="openPerson"
                    @hide="toggleHidden"
                    @stats="stepCounts = $event"
                />
            </ClientOnly>
            <p class="graph-legend muted small">
                Click a person to open them; Alt-click hides them (and everyone reached only through them). Rings: steps
                from {{ person.name }}; the more charters a person shares, the nearer it sits. Lines: links of
                {{ person.name }}, and from step 2 on the link each person was reached through. Thickness: shared
                charters, hover a line for the count. <span class="accent">Coloured lines</span>: explicit relations
                from the index, arrow = direction.
            </p>
        </section>
        <section v-else class="pane preview">
            <template v-if="preview">
                <NuxtLink :to="`/charters/${preview}`" class="open">Open charter →</NuxtLink>
                <CharterPreview :id="preview" />
            </template>
        </section>
    </article>
</template>
