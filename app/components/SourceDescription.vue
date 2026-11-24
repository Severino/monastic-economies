<script setup lang="ts">
import type { Charter, TeiNode } from "#shared/types"

// All fields of teiHeader/fileDesc/sourceDesc/msDesc, grouped for reading:
// summary, the charter (msPart), the manuscript it is copied in (msIdentifier),
// physical description (physDesc).
const props = defineProps<{ charter: Charter }>()

const hasNodes = (n?: TeiNode[]) => !!n?.some((x) => typeof x !== "string" || x.trim())

let languageNames: Intl.DisplayNames | undefined
try {
    languageNames = new Intl.DisplayNames(["en"], { type: "language" })
} catch {
    /* older runtimes: show the code */
}
const languageName = (code?: string) => {
    if (!code) return ""
    try {
        return languageNames?.of(code) ?? code
    } catch {
        return code
    }
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** summary as one entry per language: <choice><seg xml:lang> gives parallel versions. */
const summaries = computed(() => {
    const nodes = props.charter.summary ?? []
    const choice = nodes.find((n) => typeof n !== "string" && n.t === "choice")
    if (choice && typeof choice !== "string") {
        const segs = (choice.c ?? []).filter((n) => typeof n !== "string" && n.t === "seg")
        return segs.map((s) => {
            const seg = s as Exclude<TeiNode, string>
            return { lang: languageName(seg.a?.["xml:lang"]), nodes: seg.c ?? [] }
        })
    }
    return hasNodes(nodes) ? [{ lang: "", nodes }] : []
})

const folios = computed(() => {
    const { from, to } = props.charter.locus
    return [from, to].filter(Boolean).join("–")
})

const place = computed(() => {
    const m = props.charter.manuscript
    return [m.settlement, m.country].filter(Boolean).join(", ")
})

const phys = computed(() => props.charter.physDesc)
const hasPhys = computed(
    () =>
        !!phys.value.hand ||
        hasNodes(phys.value.script) ||
        !!phys.value.decoration?.length ||
        hasNodes(phys.value.additions),
)
</script>

<template>
    <div class="source-desc">
        <section v-if="summaries.length">
            <h3>Summary</h3>
            <dl v-if="summaries.length > 1">
                <div v-for="(s, i) in summaries" :key="i">
                    <dt>{{ s.lang || "Summary" }}</dt>
                    <dd><TeiNodes :nodes="s.nodes" /></dd>
                </div>
            </dl>
            <p v-else><TeiNodes :nodes="summaries[0]!.nodes" /></p>
        </section>

        <section>
            <h3>Charter</h3>
            <dl>
                <div>
                    <dt>Number</dt>
                    <dd>{{ charter.number || "–" }}</dd>
                </div>
                <div v-if="charter.altNumber">
                    <dt>Alternative number</dt>
                    <dd>{{ charter.altNumber }}</dd>
                </div>
                <div v-if="folios">
                    <dt>Folios</dt>
                    <dd>{{ folios }}</dd>
                </div>
                <div>
                    <dt>Date</dt>
                    <dd>
                        <time :datetime="charter.date.when">{{ formatDate(charter.date) || "undated" }}</time>
                    </dd>
                </div>
                <div v-if="charter.language">
                    <dt>Language</dt>
                    <dd>{{ capitalize(charter.language) }}</dd>
                </div>
            </dl>
        </section>

        <section>
            <h3>Manuscript</h3>
            <dl>
                <div v-if="charter.manuscript.repository">
                    <dt>Repository</dt>
                    <dd>{{ charter.manuscript.repository }}</dd>
                </div>
                <div v-if="place">
                    <dt>Place</dt>
                    <dd>{{ place }}</dd>
                </div>
                <div v-if="charter.manuscript.idno">
                    <dt>Shelfmark</dt>
                    <dd>{{ charter.manuscript.idno }}</dd>
                </div>
                <div v-if="charter.manuscript.altIdno">
                    <dt>Alternative shelfmark</dt>
                    <dd>{{ charter.manuscript.altIdno }}</dd>
                </div>
                <div v-if="charter.manuscript.name">
                    <dt>Name</dt>
                    <dd>{{ charter.manuscript.name }}</dd>
                </div>
            </dl>
        </section>

        <section v-if="hasPhys">
            <h3>Physical description</h3>
            <dl>
                <div v-if="phys.hand">
                    <dt>Hand</dt>
                    <dd>{{ phys.hand }}</dd>
                </div>
                <div v-if="hasNodes(phys.script)">
                    <dt>Script</dt>
                    <dd><TeiNodes :nodes="phys.script!" /></dd>
                </div>
                <div v-if="phys.decoration?.length">
                    <dt>Decoration</dt>
                    <dd>
                        <ul class="plain">
                            <li v-for="(d, i) in phys.decoration" :key="i">
                                <span v-if="d.type" class="muted">{{ capitalize(label(d.type)) }}: </span>
                                <TeiNodes :nodes="d.note" />
                            </li>
                        </ul>
                    </dd>
                </div>
                <div v-if="hasNodes(phys.additions)">
                    <dt>Additions</dt>
                    <dd><TeiNodes :nodes="phys.additions!" /></dd>
                </div>
            </dl>
        </section>
    </div>
</template>
