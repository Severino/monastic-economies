/**
 * Build step: TEI XML -> JSON in public/data.
 *
 *   <data>/xml/<collection>/*.xml   charters (collection = folder name, e.g. "fulda")
 *   <data>/indices/*.xml            central index files (persons, places, orgs, relations)
 *
 * <data> is ./data (git-ignored working data) or the folder given with --data,
 * e.g. --data fixtures for the committed sample data.
 *
 * IDs are global across charters, so all index files are merged into one set.
 * Data problems are collected in public/data/build-report.json; the build only
 * fails on XML that cannot be parsed.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import MiniSearch from 'minisearch'
import type { Book, BuildIssue, CatalogEntry, Charter, CharterLink, EntityKind } from '../../shared/types'
import { parseCharter } from './charter'
import { emptyIndices, readIndices } from './indices'
import { parseXml, type El } from './tei'
import { SEARCH_OPTIONS } from '../../shared/search'
import { ROOT, dataDir } from '../data-dir'

const DATA = dataDir()
const XML_DIR = join(DATA, 'xml')
const INDEX_DIR = join(DATA, 'indices')
const OUT = join(ROOT, 'public', 'data')

console.log(`data: ${relative(ROOT, DATA) || DATA}`)
const issues: BuildIssue[] = []
let fatal = false

function load(file: string): El | undefined {
  const errors: string[] = []
  const doc = parseXml(readFileSync(file, 'utf8'), (m) => errors.push(m))
  if (errors.length || !doc.documentElement) {
    errors.forEach((m) => issues.push({ level: 'error', file: rel(file), message: m }))
    fatal = true
    return undefined
  }
  return doc.documentElement as unknown as El
}

const rel = (f: string) => relative(ROOT, f)
const xmlFiles = (dir: string) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.xml')).sort().map((f) => join(dir, f)) : []

// ---- 1. indices ---------------------------------------------------------------
const idx = emptyIndices()
for (const f of xmlFiles(INDEX_DIR)) {
  const root = load(f)
  if (root) readIndices(root, idx, (m) => issues.push({ level: 'warning', file: rel(f), message: m }))
}

// ---- 2. charters --------------------------------------------------------------
const charters: Charter[] = []
const collections = existsSync(XML_DIR)
  ? readdirSync(XML_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : []

for (const collection of collections) {
  for (const f of xmlFiles(join(XML_DIR, collection))) {
    const tei = load(f)
    if (!tei) continue
    // charters may also carry their own standOff index blocks
    readIndices(tei, idx, (m) => issues.push({ level: 'warning', file: rel(f), message: m }))
    const id = `${collection}-${basename(f, '.xml')}`
    charters.push(
      parseCharter(tei, {
        file: rel(f),
        collection,
        id,
        issue: (level, message) => issues.push({ level, file: rel(f), message }),
      }),
    )
  }
}
charters.sort((a, b) => a.id.localeCompare(b.id))

// ---- 3. resolve mentions, back references -------------------------------------
const kindOf = (ref: string): EntityKind =>
  idx.persons.has(ref) ? 'person' : idx.places.has(ref) ? 'place' : idx.orgs.has(ref) ? 'org' : 'unresolved'

function link(list: CharterLink[], id: string, role?: string) {
  let l = list.find((x) => x.id === id)
  if (!l) list.push((l = { id, roles: [] }))
  if (role && !l.roles.includes(role)) l.roles.push(role)
}

const unresolved = new Map<string, Set<string>>()
for (const c of charters) {
  for (const m of c.mentions) {
    m.kind = kindOf(m.ref)
    const target =
      m.kind === 'person' ? idx.persons.get(m.ref) : m.kind === 'place' ? idx.places.get(m.ref) : idx.orgs.get(m.ref)
    if (target) link(target.charters, c.id, m.role)
    else {
      if (!unresolved.has(m.ref)) unresolved.set(m.ref, new Set())
      unresolved.get(m.ref)!.add(c.id)
    }
  }
}
for (const [ref, ids] of unresolved)
  issues.push({ level: 'warning', file: '-', message: `reference "${ref}" not found in any index (${[...ids].join(', ')})` })

// ---- 4. derived collections ----------------------------------------------------
const uniq = <T>(a: T[]) => [...new Set(a)]
const catalog: CatalogEntry[] = charters.map((c) => ({
  id: c.id,
  title: c.title,
  number: c.number,
  collection: c.collection,
  bookId: c.bookId,
  date: c.date,
  persons: uniq(c.mentions.filter((m) => m.kind === 'person').map((m) => m.ref)),
  places: uniq(c.mentions.filter((m) => m.kind === 'place').map((m) => m.ref)),
  orgs: uniq(c.mentions.filter((m) => m.kind === 'org').map((m) => m.ref)),
  actionTypes: uniq(c.actions.flatMap((a) => a.types)),
  issuers: uniq(c.mentions.filter((m) => m.role === 'issuer').map((m) => m.ref)),
}))

const books = new Map<string, Book>()
for (const c of charters) {
  if (!books.has(c.bookId)) books.set(c.bookId, { id: c.bookId, idno: c.bookId, charters: [] })
  books.get(c.bookId)!.charters.push(c.id)
}

// co-occurrence edges for the network view
const cooc = new Map<string, { source: string; target: string; charters: string[] }>()
for (const e of catalog) {
  const ps = [...e.persons].sort()
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const k = `${ps[i]}|${ps[j]}`
      if (!cooc.has(k)) cooc.set(k, { source: ps[i], target: ps[j], charters: [] })
      cooc.get(k)!.charters.push(e.id)
    }
}

const geojson = {
  type: 'FeatureCollection',
  features: [...idx.places.values()]
    .filter((p) => p.coords)
    .map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: p.coords },
      properties: { id: p.id, name: p.names[0]?.name ?? p.id, types: p.types.join(' '), charters: p.charters.length },
    })),
}

const personName = (id: string) => idx.persons.get(id)?.name ?? ''
const placeName = (id: string) => idx.places.get(id)?.names[0]?.name ?? ''
const search = new MiniSearch(SEARCH_OPTIONS)
search.addAll(
  charters.map((c) => ({
    id: c.id,
    title: c.title,
    text: c.plainText,
    persons: catalog.find((e) => e.id === c.id)!.persons.map(personName).join(' '),
    places: catalog.find((e) => e.id === c.id)!.places.map(placeName).join(' '),
  })),
)

// ---- 5. write -------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'charters'), { recursive: true })
const write = (name: string, data: unknown) => writeFileSync(join(OUT, name), JSON.stringify(data))

for (const c of charters) write(`charters/${c.id}.json`, c)
write('catalog.json', catalog)
write('persons.json', [...idx.persons.values()])
write('places.json', [...idx.places.values()])
write('orgs.json', [...idx.orgs.values()])
write('relations.json', { explicit: idx.relations, cooccurrence: [...cooc.values()] })
write('books.json', [...books.values()])
write('places.geojson', geojson)
write('search-index.json', search.toJSON())
writeFileSync(join(OUT, 'build-report.json'), JSON.stringify(issues, null, 2))

const errors = issues.filter((i) => i.level === 'error').length
console.log(
  `charters: ${charters.length}, persons: ${idx.persons.size}, places: ${idx.places.size}, orgs: ${idx.orgs.size}, ` +
    `relations: ${idx.relations.length}\n` +
    `issues: ${errors} error(s), ${issues.length - errors} warning(s) -> public/data/build-report.json`,
)
for (const i of issues) console.log(`  [${i.level}] ${i.file}: ${i.message}`)
if (fatal) process.exit(1)
