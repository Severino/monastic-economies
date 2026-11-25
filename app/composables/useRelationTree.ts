import type { Id } from "#shared/types"
import type { RelationsFile } from "./useEgoNetwork"

export interface TreeLink {
    /** directed: a is active, b passive; mutual: a < b */
    a: Id
    b: Id
    directed: boolean
    names: string[]
}

export interface RelationTree {
    /**
     * every person reachable through explicit relations, with its generation (the centre person is 0) and
     * its distance: the fewest relations between it and the centre person (1 = direct relation)
     */
    levels: { id: Id; level: number; dist: number }[]
    links: TreeLink[]
}

/**
 * All persons connected to one person through explicit relations (recursively), charters ignored.
 * Generations like a family tree: the passive side of a directed relation sits one level below the active
 * side (parent above child, lord above vassal), mutual relations (siblings, spouses) on the same level.
 * Where the relations disagree, the first level found (breadth-first from the centre) wins.
 * Computed while prerendering, so only this person's tree is in the page payload.
 */
export function useRelationTree(id: MaybeRefOrGetter<string>) {
    const { data: persons } = usePersons()
    return useAsyncData(
        `relation-tree-${toValue(id)}`,
        async (): Promise<RelationTree> => {
            const self = toValue(id)
            const rel = await $fetch<RelationsFile>("/api/data/relations.json")
            const isPerson = (p: Id) => !persons.value || !!persons.value[p]
            const byPair = new Map<string, TreeLink>()
            const add = (a: Id, b: Id, directed: boolean, name: string) => {
                if (a === b || !isPerson(a) || !isPerson(b)) return
                if (!directed && b < a) [a, b] = [b, a]
                const key = `${a} ${b} ${directed}`
                if (!byPair.has(key)) byPair.set(key, { a, b, directed, names: [] })
                const l = byPair.get(key)!
                if (!l.names.includes(label(name))) l.names.push(label(name))
            }
            for (const r of rel.explicit) {
                for (const a of r.active ?? []) for (const b of r.passive ?? []) add(a, b, true, r.name)
                const m = r.mutual ?? []
                for (let i = 0; i < m.length; i++)
                    for (let j = i + 1; j < m.length; j++) add(m[i]!, m[j]!, false, r.name)
            }
            // neighbours with the level step: +1 = below, -1 = above, 0 = same level
            const next = new Map<Id, { to: Id; step: number }[]>()
            const push = (from: Id, to: Id, step: number) => {
                if (!next.has(from)) next.set(from, [])
                next.get(from)!.push({ to, step })
            }
            for (const l of byPair.values()) {
                push(l.a, l.b, l.directed ? 1 : 0)
                push(l.b, l.a, l.directed ? -1 : 0)
            }
            const level = new Map([[self, 0]])
            const dist = new Map([[self, 0]])
            const queue = [self]
            while (queue.length) {
                const from = queue.shift()!
                for (const { to, step } of (next.get(from) ?? []).sort((x, y) => x.to.localeCompare(y.to)))
                    if (!level.has(to)) {
                        level.set(to, level.get(from)! + step)
                        dist.set(to, dist.get(from)! + 1)
                        queue.push(to)
                    }
            }
            return {
                levels: [...level].map(([id, l]) => ({ id, level: l, dist: dist.get(id)! })),
                links: [...byPair.values()].filter((l) => level.has(l.a) && level.has(l.b)),
            }
        },
        { watch: [() => toValue(id)] },
    )
}
