import type { CharterId, Id, Relation } from "#shared/types"

export interface EgoRelation {
    name: string
    category?: string
    /** "mutual", or the direction seen from the centre person: "out" = centre is active */
    dir: "mutual" | "out" | "in"
}

export interface EgoNeighbor {
    id: Id
    /** charters in which both persons are mentioned */
    charters: CharterId[]
    /** explicit relations from the index file (listRelation) */
    relations: EgoRelation[]
}

export interface RelationsFile {
    explicit: Relation[]
    cooccurrence: { source: Id; target: Id; charters: CharterId[] }[]
}

/**
 * Ego network of one person: every person connected to it by co-occurrence in a
 * charter or by an explicit relation. Computed while prerendering, so the page
 * payload only carries this person's neighbours, not the whole relations file.
 */
export function useEgoNetwork(id: MaybeRefOrGetter<string>) {
    const { data: persons } = usePersons()
    return useAsyncData(
        `ego-${toValue(id)}`,
        async () => {
            const self = toValue(id)
            const rel = await $fetch<RelationsFile>("/api/data/relations.json")
            const isPerson = (p: Id) => !persons.value || !!persons.value[p]
            const byId = new Map<Id, EgoNeighbor>()
            const neighbor = (p: Id) => {
                if (!byId.has(p)) byId.set(p, { id: p, charters: [], relations: [] })
                return byId.get(p)!
            }

            for (const e of rel.cooccurrence) {
                const other = e.source === self ? e.target : e.target === self ? e.source : undefined
                if (other) neighbor(other).charters.push(...e.charters)
            }
            for (const r of rel.explicit) {
                const add = (others: Id[] | undefined, dir: EgoRelation["dir"]) => {
                    for (const o of others ?? [])
                        if (o !== self && isPerson(o))
                            neighbor(o).relations.push({ name: r.name, category: r.category, dir })
                }
                if (r.mutual?.includes(self)) add(r.mutual, "mutual")
                if (r.active?.includes(self)) add(r.passive, "out")
                if (r.passive?.includes(self)) add(r.active, "in")
            }

            return [...byId.values()].sort(
                (a, b) =>
                    b.relations.length - a.relations.length ||
                    b.charters.length - a.charters.length ||
                    a.id.localeCompare(b.id),
            )
        },
        { watch: [() => toValue(id)] },
    )
}

/** "sibling", "head of →", "← head of" */
export const relationLabel = (r: EgoRelation) =>
    r.dir === "mutual" ? label(r.name) : r.dir === "out" ? `${label(r.name)} →` : `← ${label(r.name)}`
