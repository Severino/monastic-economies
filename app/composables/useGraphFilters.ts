import type { SexCategory } from "~/utils/person"

/**
 * Filters of the person graphs, shared by all persons and remembered in localStorage, so a choice (e.g. family
 * relations only) stays when moving from person to person and after a reload:
 * - relation types switched off (`monastic-economies:graph-relations-off`): persons are only reached through the
 *   relations left on; `CHARTERS` stands for shared charters (Charter Graph only)
 * - sex categories switched off (`monastic-economies:graph-sex-off`): those persons stay, drawn faded
 * Read after hydration (onMounted), so server and client render the same.
 */
const RELATIONS_KEY = "monastic-economies:graph-relations-off"
const SEX_KEY = "monastic-economies:graph-sex-off"
/** legend entry for links by shared charters */
export const CHARTERS = "shared charters"

const relationsOff = ref<string[]>([])
const sexOff = ref<SexCategory[]>([])
let loaded = false

function read<T>(key: string): T[] {
    try {
        const v = JSON.parse(localStorage.getItem(key) ?? "[]")
        return Array.isArray(v) ? v : []
    } catch {
        return []
    }
}
function write(key: string, v: unknown[]) {
    try {
        if (v.length) localStorage.setItem(key, JSON.stringify(v))
        else localStorage.removeItem(key)
    } catch {
        // storage unavailable: the choice lasts for this visit
    }
}
const toggle = <T>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export function useGraphFilters() {
    onMounted(() => {
        if (loaded) return
        loaded = true
        relationsOff.value = read(RELATIONS_KEY)
        sexOff.value = read(SEX_KEY)
    })
    return {
        relationsOff: readonly(relationsOff),
        sexOff: readonly(sexOff),
        relationOn: (name: string) => !relationsOff.value.includes(name),
        sexOn: (s: SexCategory) => !sexOff.value.includes(s),
        toggleRelation(name: string) {
            relationsOff.value = toggle(relationsOff.value, name)
            write(RELATIONS_KEY, relationsOff.value)
        },
        showAllRelations() {
            relationsOff.value = []
            write(RELATIONS_KEY, [])
        },
        toggleSex(s: SexCategory) {
            sexOff.value = toggle(sexOff.value, s)
            write(SEX_KEY, sexOff.value)
        },
    }
}
