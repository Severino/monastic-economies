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
// the steps differ per diagram, so switching starts with the diagram's default
const setView = (v: View) =>
    router.push({ query: { ...route.query, view: v === "charters" ? undefined : v, depth: undefined } })

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

// steps from the centre person (URL: ?depth=2). Charter Graph: 1–5, default 1 (it grows fast). Relations Graph:
// as many steps as the relations reach (one button each), default all.
const relationSteps = computed(() => Math.max(0, ...(tree.value?.levels.map((l) => l.dist) ?? [])))
const maxDepth = computed(() => (view.value === "relations" ? Math.max(1, relationSteps.value) : 5))
const defaultDepth = computed(() => (view.value === "relations" ? maxDepth.value : 1))
const depth = computed(() => Math.min(maxDepth.value, Math.max(1, Number(route.query.depth) || defaultDepth.value)))
const setDepth = (d: number) =>
    router.push({ query: { ...route.query, depth: d === defaultDepth.value ? undefined : String(d) } })
// persons switched off in the graph (URL: ?hide=a,b), remembered per person in localStorage
// (`monastic-economies:hidden:<id>`): a link without ?hide= restores them
const hidden = computed(() =>
    String(route.query.hide ?? "")
        .split(",")
        .filter(Boolean),
)
const setHidden = (ids: string[]) =>
    router.push({ query: { ...route.query, hide: ids.length ? ids.join(",") : undefined } })
const toggleHidden = (id: string) =>
    setHidden(hidden.value.includes(id) ? hidden.value.filter((h) => h !== id) : [...hidden.value, id])
const HIDDEN = "monastic-economies:hidden:"
let restoredFor = ""
function syncHidden() {
    try {
        if (restoredFor !== props.id) {
            // first look at this person: restore what was hidden last time, unless the URL says otherwise
            restoredFor = props.id
            const stored = localStorage.getItem(HIDDEN + props.id)
            if (!route.query.hide && stored) {
                router.replace({ query: { ...route.query, hide: stored } })
                return
            }
        }
        const ids = hidden.value.filter((h) => h !== props.id).join(",")
        if (ids) localStorage.setItem(HIDDEN + props.id, ids)
        else localStorage.removeItem(HIDDEN + props.id)
    } catch {
        // storage unavailable: the URL still holds them
    }
}
onMounted(() => {
    syncHidden()
    watch(() => [props.id, route.query.hide], syncHidden)
})
const hiddenCount = computed(() => hidden.value.filter((h) => h !== props.id).length)

// only explicit relations (URL: ?unrelated=hide): persons that just share charters are left out
const hideUnrelated = computed(() => route.query.unrelated === "hide")
const toggleUnrelated = () =>
    router.push({ query: { ...route.query, unrelated: hideUnrelated.value ? undefined : "hide" } })
const graphQuery = computed(() => ({
    view: view.value === "charters" ? undefined : view.value,
    depth: route.query.depth as string | undefined,
    unrelated: hideUnrelated.value ? "hide" : undefined,
}))
const openPerson = (id: string) => router.push({ path: `/persons/${id}`, query: graphQuery.value })
/** hidden persons, by name */
const hiddenRows = computed(() =>
    hidden.value.filter((h) => h !== props.id).sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
)
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
        hidden: hiddenRows.value.map((h) => byId.get(h) ?? { id: h, charters: [], relations: [] }),
    }
})
// list next to the relation tree: everyone in it, nearest first (fewest relations between them and this
// person: direct relations, then 2 steps, …), then by name; with their relations in the tree
const treeGroups = computed(() => {
    const t = tree.value
    if (!t) return []
    // steps again without the hidden persons (they cut the paths through them), up to the chosen depth
    const off = new Set(hidden.value)
    const dist = new Map([[props.id, 0]])
    let frontier = [props.id]
    for (let d = 1; frontier.length && d <= depth.value; d++) {
        const next: string[] = []
        for (const n of frontier)
            for (const l of t.links) {
                const other = l.a === n ? l.b : l.b === n ? l.a : undefined
                if (!other || off.has(other) || dist.has(other)) continue
                dist.set(other, d)
                next.push(other)
            }
        frontier = next
    }
    const rows = [...dist]
        .filter(([id]) => id !== props.id)
        .sort(([a, da], [b, db]) => da - db || nameOf(a).localeCompare(nameOf(b)))
        .map(([id, d]) => ({ id, dist: d, relations: relationsOf(id) }))
    const groups = new Map<number, typeof rows>()
    for (const r of rows) groups.set(r.dist, [...(groups.get(r.dist) ?? []), r])
    return [...groups].map(([d, items]) => ({
        title: d === 1 ? "Direct relations" : `${d} steps`,
        items,
    }))
})
/** a person's relations in the tree, read from that person: "parent of Odo", "has parent Hugo" */
function relationsOf(id: string) {
    return (tree.value?.links ?? [])
        .filter((l) => l.a === id || l.b === id)
        .map((l) => {
            const other = nameOf(l.a === id ? l.b : l.a)
            const names = l.names.join(", ")
            return !l.directed || l.a === id ? `${names} of ${other}` : `has ${names} ${other}`
        })
}
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
                    <Share2 :size="16" /> Charter Graph ({{ neighbors?.length ?? 0 }})
                </button>
                <button type="button" :class="{ active: view === 'relations' }" @click="setView('relations')">
                    <Network :size="16" /> Relations Graph ({{ treeSize }})
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
                        <h2
                            v-if="sec.items.length"
                            class="neighbor-heading"
                            :class="{ 'hidden-heading': sec.key === 'hidden' }"
                        >
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
                <p v-if="!treeSize" class="muted">No explicit relations to other persons.</p>
                <template
                    v-for="g in [
                        ...treeGroups,
                        { title: 'Hidden', items: hiddenRows.map((h) => ({ id: h, relations: relationsOf(h) })) },
                    ]"
                    :key="g.title"
                >
                    <h2 v-if="g.items.length" class="neighbor-heading">
                        {{ g.title }} <span class="count">{{ g.items.length }}</span>
                        <button v-if="g.title === 'Hidden'" type="button" class="link-btn small" @click="setHidden([])">
                            Show all
                        </button>
                    </h2>
                    <ul v-if="g.items.length" class="neighbor-list">
                        <li
                            v-for="r in g.items"
                            :key="r.id"
                            class="neighbor-row"
                            :data-person="r.id"
                            :class="{ hovered: r.id === hovered, active: r.id === selected, off: g.title === 'Hidden' }"
                            @mouseenter="hovered = r.id"
                            @mouseleave="hovered = undefined"
                        >
                            <button
                                type="button"
                                class="eye"
                                :title="g.title === 'Hidden' ? 'Show in graph' : 'Hide in graph'"
                                :aria-pressed="g.title !== 'Hidden'"
                                @click="toggleHidden(r.id)"
                            >
                                <EyeOff v-if="g.title === 'Hidden'" :size="16" />
                                <Eye v-else :size="16" />
                            </button>
                            <NuxtLink :to="{ path: `/persons/${r.id}`, query: graphQuery }" class="neighbor">
                                <span class="name" :class="sexOf(persons?.[r.id]?.sex)" :title="altOf(r.id)">{{
                                    nameOf(r.id)
                                }}</span>
                                <span class="relations">{{ r.relations.join(", ") }}</span>
                            </NuxtLink>
                        </li>
                    </ul>
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
        <section v-if="view !== 'charters'" class="pane graph-pane">
            <div class="graph-toolbar">
                <span class="muted small">Steps</span>
                <div class="view-switch depth-switch" role="group" aria-label="Steps from this person">
                    <button
                        v-for="d in maxDepth"
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
                    v-if="hiddenCount"
                    type="button"
                    class="toggle-btn hidden-info"
                    title="Show all hidden persons again"
                    @click="setHidden([])"
                >
                    <EyeOff :size="16" /> {{ hiddenCount }} person{{ hiddenCount === 1 ? "" : "s" }} hidden
                </button>
                <button
                    v-if="view === 'graph'"
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
            <p v-if="view === 'relations' && !treeSize" class="muted graph-empty">
                {{ person.name }} has no explicit relations in the index.
            </p>
            <ClientOnly v-else>
                <PersonGraph
                    :id="id"
                    :mode="view === 'relations' ? 'relations' : 'charters'"
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
            <p v-if="view === 'graph'" class="graph-legend muted small">
                {{ person.name }} stays in the middle; everyone else is pushed outwards and held by their lines: the
                more charters a line stands for, the tighter it holds. Lines: links of {{ person.name }}, from step 2 on
                the link each person was reached through, and relations among the persons shown. Thickness: shared
                charters. <span class="accent">Coloured lines</span>: explicit relations from the index, arrow =
                direction. Drag a person to pin them (double-click releases), click to select, Ctrl/⌘-click to open,
                Alt-click to hide (with everyone reached only through them).
            </p>
            <p v-else class="graph-legend muted small">
                Persons connected to {{ person.name }} through relations from the index, followed recursively; shared
                charters are ignored. Arrows point from the active to the passive side of a relation (e.g. lord →
                vassal). Drag a person to pin them (double-click releases), click to select, Ctrl/⌘-click to open,
                Alt-click to hide.
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
