import type { CatalogEntry, Charter, Org, Person, Place } from "#shared/types"

/** All data comes from static JSON produced by `npm run data`. */
const get = <T>(path: string) => $fetch<T>(`/api/data/${path}`)

export const useCatalog = () => useAsyncData("catalog", () => get<CatalogEntry[]>("catalog.json"))

export const useCharter = (id: MaybeRefOrGetter<string>) =>
    useAsyncData(`charter-${toValue(id)}`, () => get<Charter>(`charters/${toValue(id)}.json`), {
        watch: [() => toValue(id)],
    })

function useIndex<T extends { id: string }>(name: string) {
    return useAsyncData(
        name,
        async () => Object.fromEntries((await get<T[]>(`${name}.json`)).map((e) => [e.id, e])) as Record<string, T>,
    )
}

export const usePersons = () => useIndex<Person>("persons")
export const usePlaces = () => useIndex<Place>("places")
export const useOrgs = () => useIndex<Org>("orgs")

export const placeName = (p?: Place) => p?.names[0]?.name ?? "?"
export const orgName = (o?: Org) => o?.names[0]?.name ?? "?"

export function formatDateHuman(d?: { when?: string; from?: string; to?: string }) {
    console.log("HUMAN", d)
    if (!d) return ""
    const format = (text: string) => {
        return new Date(text).toLocaleDateString("en", {
            day: "numeric",
            month: "long",
            year: "numeric",
            weekday: "short",
        })
    }
    if (d.when) return format(d.when)
    if (d.from || d.to) return `${d.from ? format(d.from) : "?"} – ${d.to ? format(d.to) : "?"}`
    return ""
}

export function formatDate(d?: { when?: string; from?: string; to?: string }) {
    if (!d) return ""
    const format = (s: string) => s.replace(/^0+/, "")
    if (d.when) return format(d.when)
    if (d.from || d.to) return `${d.from ? format(d.from) : "?"} – ${d.to ? format(d.to) : "?"}`
    return ""
}

/** Human-readable labels for camelCase enum values (issuer, placeIssue, unrestrictedUse …). */
export const label = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
