<script setup lang="ts">
import { Eye, EyeOff, List, Share2, X } from "lucide-vue-next"

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
const names = computed(() => Object.fromEntries(Object.values(persons.value ?? {}).map((p) => [p.id, p.name])))
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
const graphQuery = computed(() => ({
    view: "graph",
    depth: depth.value > 1 ? String(depth.value) : undefined,
    hide: hidden.value.filter((h) => h !== props.id).join(",") || undefined,
}))
const openPerson = (id: string) => router.push({ path: `/persons/${id}`, query: graphQuery.value })
const stepCounts = ref<number[]>([])
const shown = computed(() => stepCounts.value.reduce((a, b) => a + b, 0))

const sexIcon: Record<string, string> = { m: "♂", male: "♂", f: "♀", female: "♀" }
</script>

<template>
    <div v-if="!person" class="notice">Person “{{ id }}” not found.</div>
    <article v-else class="split">
        <section class="pane">
            <p class="eyebrow">Person</p>
            <h1>
                <span v-if="person.sex" class="sex" :title="person.sex">{{ sexIcon[person.sex] ?? "" }}</span>
                {{ person.name }}
                <span v-if="person.roleName" class="muted">{{ person.roleName }}</span>
            </h1>
            <p v-if="person.altNames.length" class="muted">also: {{ person.altNames.join(", ") }}</p>
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
                <ul v-else class="neighbor-list">
                    <li
                        v-for="n in neighbors"
                        :key="n.id"
                        class="neighbor-row"
                        :class="{ selected: n.id === hovered, off: hidden.includes(n.id) }"
                        @mouseenter="hovered = n.id"
                        @mouseleave="hovered = undefined"
                    >
                        <button
                            type="button"
                            class="eye"
                            :title="hidden.includes(n.id) ? 'Show in graph' : 'Hide in graph'"
                            :aria-pressed="!hidden.includes(n.id)"
                            @click="toggleHidden(n.id)"
                        >
                            <EyeOff v-if="hidden.includes(n.id)" :size="16" />
                            <Eye v-else :size="16" />
                        </button>
                        <NuxtLink :to="{ path: `/persons/${n.id}`, query: graphQuery }" class="neighbor">
                            <span class="name">
                                <strong>{{ splitName(names[n.id] ?? n.id).first }}</strong>
                                <span v-if="splitName(names[n.id] ?? n.id).rest" class="rest">{{
                                    splitName(names[n.id] ?? n.id).rest
                                }}</span>
                            </span>
                            <span v-if="n.relations.length" class="relations">{{
                                n.relations.map(relationLabel).join(", ")
                            }}</span>
                            <span class="muted small"
                                >{{ n.charters.length }} shared charter{{ n.charters.length === 1 ? "" : "s" }}</span
                            >
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
            </div>
            <div v-if="hidden.length" class="graph-toolbar hidden-row">
                <span class="muted small">Hidden</span>
                <button
                    v-for="h in hidden"
                    :key="h"
                    type="button"
                    class="chip"
                    :title="`Show ${names[h] ?? h} again`"
                    @click="toggleHidden(h)"
                >
                    {{ names[h] ?? h }} <X :size="14" />
                </button>
                <button type="button" class="link-btn small" @click="setHidden([])">Show all</button>
            </div>
            <ClientOnly>
                <PersonGraph
                    :id="id"
                    :names="names"
                    :depth="depth"
                    :highlight="hovered"
                    :hidden="hidden"
                    @hover="hovered = $event"
                    @select="openPerson"
                    @hide="toggleHidden"
                    @stats="stepCounts = $event"
                />
            </ClientOnly>
            <p class="graph-legend muted small">
                Click a person to hide them (and everyone reached only through them); Ctrl/⌘-click opens the person.
                Rings: steps from {{ person.name }}. Lines: links of {{ person.name }}, and from step 2 on the link each
                person was reached through. Thickness: shared charters, hover a line for the count.
                <span class="accent">Coloured lines</span>: explicit relations from the index, arrow = direction.
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
