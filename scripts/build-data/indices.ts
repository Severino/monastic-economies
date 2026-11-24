import type { Org, Person, Place, Relation } from "../../shared/types"
import {
    attr,
    child,
    children,
    descendants,
    joinBrokenWords,
    text,
    toTree,
    trimNodes,
    xmlId,
    xmlLang,
    type El,
} from "./tei"

export interface Indices {
    persons: Map<string, Person>
    places: Map<string, Place>
    orgs: Map<string, Org>
    relations: Relation[]
}

export const emptyIndices = (): Indices => ({
    persons: new Map(),
    places: new Map(),
    orgs: new Map(),
    relations: [],
})

const refs = (v?: string) =>
    v
        ? v
              .trim()
              .split(/\s+/)
              .map((t) => t.replace(/^#/, ""))
        : undefined

/**
 * Reads every listPerson/listPlace/listOrg/listRelation below `root`
 * (works for a standalone index file and for standOff blocks inside a charter).
 */
export function readIndices(root: El, into: Indices, issue: (m: string) => void) {
    for (const p of descendants(root, "person")) {
        const id = xmlId(p)
        if (!id) continue
        const persName = child(p, "persName")
        const names = persName ? children(persName, "name").map(text) : [text(child(p, "name"))]
        if (into.persons.has(id)) issue(`duplicate person id "${id}"`)
        into.persons.set(id, {
            id,
            name: names[0] || id,
            altNames: names.slice(1),
            roleName: text(child(persName, "roleName")) || undefined,
            sex: attr(p, "sex") ?? (attr(child(p, "sex"), "value") || text(child(p, "sex")) || undefined),
            socecStatus: text(child(p, "socecStatus")) || undefined,
            affiliations: children(p, "affiliation").map((a) => ({
                type: attr(a, "type") ?? "family",
                ref: attr(a, "ref")?.replace(/^#/, ""),
                label: text(a),
            })),
            note: child(p, "note") ? joinBrokenWords(trimNodes(toTree(child(p, "note")!))) : undefined,
            charters: [],
        })
    }

    for (const p of descendants(root, "place")) {
        const id = xmlId(p)
        if (!id) continue
        const location = child(p, "location")
        const geo = child(location, "geo")
        let coords: [number, number] | undefined
        if (geo) {
            const decls = attr(geo, "decls") ?? "WGS84/y-x"
            // "48.58, 7.74", "48.58 7.74" or WKT "Point(48.58 7.74)"; the order always follows @decls
            const nums = (text(geo).match(/[-+]?\d+(?:\.\d+)?/g) ?? []).map(Number)
            if (nums.length === 2 && nums.every(Number.isFinite)) {
                // "y-x" = "lat, lon"; GeoJSON wants [lon, lat]
                coords = /y-x/.test(decls) ? [nums[1], nums[0]] : [nums[0], nums[1]]
            } else issue(`place "${id}": cannot read coordinates "${text(geo)}"`)
        }
        into.places.set(id, {
            id,
            names: children(p, "placeName").map((n) => ({ lang: xmlLang(n), name: text(n) })),
            types: (attr(p, "type") ?? "").split(/\s+/).filter(Boolean),
            coords,
            cert: attr(location, "cert"),
            note: child(p, "note") ? joinBrokenWords(trimNodes(toTree(child(p, "note")!))) : undefined,
            charters: [],
        })
    }

    for (const o of descendants(root, "org")) {
        const id = xmlId(o)
        if (!id) continue
        into.orgs.set(id, {
            id,
            names: children(o, "orgName").map((n) => ({ lang: xmlLang(n), name: text(n) })),
            type: attr(o, "type"),
            charters: [],
        })
    }

    for (const r of descendants(root, "relation")) {
        into.relations.push({
            name: attr(r, "name") ?? "unknown",
            category: attr(r, "type"),
            active: refs(attr(r, "active")),
            passive: refs(attr(r, "passive")),
            mutual: refs(attr(r, "mutual")),
        })
    }
}
