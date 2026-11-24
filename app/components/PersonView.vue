<script setup lang="ts">
import { Eye, EyeOff, Link2Off, List, Network, Share2 } from "lucide-vue-next"
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
// ---- Charters | Graph | Relations (URL: ?view=graph, ?view=relations) ------------------
type View = "charters" | "graph" | "relations"
const view = computed<View>(() =>
    route.query.view === "graph" || route.query.view === "relations" ? route.query.view : "charters",
)
const setView = (v: View) => router.push({ query: { ...route.query, view: v === "charters" ? undefined : v } })

const { data: neighbors } = await useEgoNetwork(() => props.id)
const nameOf = (id: string) => persons.value?.[id]?.name ?? id
const altOf = (id: string) => {
    const alt = persons.value?.[id]?.altNames ?? []
    return alt.length ? `also: ${alt.join(", ")}` : undefined
}
const { data: tree } = await useRelationTree(() => props.id)
// hovered (list or diagram) and selected (click in the diagram) persons: highlighted in both
const hovered = ref<string>()
const selected = ref<string>()
watch(
    () => [props.id, view.value],
    () => (selected.value = undefined),
)
// a person selected in the diagram scrolls its row into view
watch(selected, async (id) => {
    if (!id) return
    await nextTick()
    document.querySelector(`[data-person="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" })
})

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
    view: view.value === "charters" ? undefined : view.value,
    depth: depth.value > 1 ? String(depth.value) : undefined,
    hide: hidden.value.filter((h) => h !== props.id).join(",") || undefined,
    unrelated: hideUnrelated.value ? "hide" : undefined,
}))
const openPerson = (id: string) => router.push({ path: `/persons/${id}`, query: graphQuery.value })
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
// list next to the relation tree: everyone in it, by generation, with their relations in the tree
const treeRows = computed(() => {
    const t = tree.value
    if (!t) return []
    const level = new Map(t.levels.map((l) => [l.id, l.level]))
    return t.levels
        .filter((l) => l.id !== props.id)
        .sort((a, b) => a.level - b.level || nameOf(a.id).localeCompare(nameOf(b.id)))
        .map(({ id }) => ({
            id,
            relations: t.links
                .filter((l) => l.a === id || l.b === id)
                .map((l) => {
                    const other = nameOf(l.a === id ? l.b : l.a)
                    const names = l.names.join(", ")
                    return !l.directed
                        ? `${names} of ${other}`
                        : l.a === id
                          ? `${names} of ${other}`
                          : `has ${names} ${other}`
                }),
            level: level.get(id)!,
        }))
})
const treeSize = computed(() => Math.max(0, (tree.value?.levels.length ?? 0) - 1))
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
                <button type="button" :class="{ active: view === 'relations' }" @click="setView('relations')">
                    <Network :size="16" /> Relations ({{ treeSize }})
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
                                :data-person="n.id"
                                :class="{
                                    hovered: n.id === hovered,
                                    active: n.id === selected,
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
            <template v-else-if="view === 'relations'">
                <p v-if="!treeRows.length" class="muted">No explicit relations to other persons.</p>
                <ul v-else class="neighbor-list">
                    <li
                        v-for="r in treeRows"
                        :key="r.id"
                        class="neighbor-row"
                        :data-person="r.id"
                        :class="{ hovered: r.id === hovered, active: r.id === selected }"
                        @mouseenter="hovered = r.id"
                        @mouseleave="hovered = undefined"
                    >
                        <NuxtLink :to="{ path: `/persons/${r.id}`, query: graphQuery }" class="neighbor">
                            <span class="name" :class="sexOf(persons?.[r.id]?.sex)" :title="altOf(r.id)">{{
                                nameOf(r.id)
                            }}</span>
                            <span class="relations">{{ r.relations.join(", ") }}</span>
                        </NuxtLink>
                    </li>
                </ul>
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
                    :selected="selected"
                    @hover="hovered = $event"
                    @select="selected = $event"
                    @open="openPerson"
                    @hide="toggleHidden"
                    @stats="stepCounts = $event"
                />
            </ClientOnly>
            <p class="graph-legend muted small">
                Drag a person to move them, click to select, Ctrl/⌘-click to open, Alt-click to hide (with everyone
                reached only through them). Rings: steps from {{ person.name }}; the more charters a person shares, the
                nearer it sits. Lines: links of {{ person.name }}, and from step 2 on the link each person was reached
                through. Thickness: shared charters. <span class="accent">Coloured lines</span>: explicit relations from
                the index, arrow = direction.
            </p>
        </section>
        <section v-else-if="view === 'relations'" class="pane graph-pane">
            <div class="graph-toolbar">
                <span class="muted small"
                    >{{ treeSize }} related person{{ treeSize === 1 ? "" : "s" }}, explicit relations only</span
                >
            </div>
            <p v-if="!treeSize" class="muted graph-empty">{{ person.name }} has no explicit relations in the index.</p>
            <ClientOnly v-else>
                <RelationTree
                    :id="id"
                    :persons="persons ?? {}"
                    :tree="tree!"
                    :highlight="hovered"
                    :selected="selected"
                    @hover="hovered = $event"
                    @select="selected = $event"
                    @open="openPerson"
                />
            </ClientOnly>
            <p class="graph-legend muted small">
                All persons connected to {{ person.name }} through relations from the index, followed recursively;
                shared charters are ignored. Arrows point from the active to the passive side of a relation (e.g. lord →
                vassal), which also stands one row lower; mutual relations side by side. Drag a person to move them,
                click to select, Ctrl/⌘-click to open.
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
