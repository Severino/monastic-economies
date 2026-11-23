// Data model shared between the build script (scripts/build-data) and the Nuxt app.
// See docs/datenmodell.md for the rationale.

export type Id = string // xml:id from the index files, e.g. "hugo1"
export type CharterId = string // "{collection}-{file name}", e.g. "fulda-001"

export interface DateSpec {
    when?: string
    from?: string
    to?: string
}

/** Compact TEI tree. Strings are text nodes. */
export type TeiNode =
    | string
    | {
          t: string // local element name: div, ab, head, rs, lb, pb, add, del, …
          a?: Record<string, string> // attributes; ref/facs/corresp are normalised (no '#')
          c?: TeiNode[]
      }

export interface PageRef {
    id: string // surface xml:id, e.g. "f-2v"
    label: string // "2v"
    image: string // graphic/@url
    iiif?: string
}

export type EntityKind = "person" | "place" | "org" | "unresolved"

export interface Mention {
    ref: Id
    kind: EntityKind
    role?: string
    section?: string // ab/@type or "head"
}

export interface Action {
    types: string[] // e.g. ["land", "unrestrictedUse"]
    section?: string
    text: string
}

export interface Charter {
    id: CharterId
    collection: string
    bookId: string
    number: string
    altNumber?: string
    title: string
    date: DateSpec
    locus: { from?: string; to?: string }
    language?: string
    summary?: TeiNode[]
    physDesc: { hand?: string; script?: TeiNode[]; additions?: TeiNode[] }
    pages: PageRef[]
    body: TeiNode[]
    notes: Record<string, TeiNode[]>
    mentions: Mention[]
    actions: Action[]
    plainText: string
}

export interface CatalogEntry {
    id: CharterId
    title: string
    number: string
    collection: string
    bookId: string
    date: DateSpec
    persons: Id[]
    places: Id[]
    orgs: Id[]
    actionTypes: string[]
    issuers: Id[]
}

export interface CharterLink {
    id: CharterId
    roles: string[]
}

export interface Person {
    id: Id
    name: string
    altNames: string[]
    roleName?: string
    sex?: string
    socecStatus?: string
    affiliations: { type: string; ref?: Id; label: string }[]
    note?: TeiNode[]
    charters: CharterLink[]
}

export interface Place {
    id: Id
    names: { lang?: string; name: string }[]
    types: string[]
    coords?: [number, number] // [lon, lat] (GeoJSON order)
    cert?: string
    note?: TeiNode[]
    charters: CharterLink[]
}

export interface Org {
    id: Id
    names: { lang?: string; name: string }[]
    type?: string
    charters: CharterLink[]
}

export interface Relation {
    name: string
    category?: string
    active?: Id[]
    passive?: Id[]
    mutual?: Id[]
}

export interface Book {
    id: string
    idno: string
    name?: string
    repository?: string
    settlement?: string
    country?: string
    charters: CharterId[]
}

export interface BuildIssue {
    level: "error" | "warning"
    file: string
    message: string
}
