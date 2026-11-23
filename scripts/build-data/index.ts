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
let fatal = 0 // files that could not be read or parsed

function load(file: string): El | undefined {
  const fail = (message: string) => {
    issues.push({ level: 'error', file: rel(file), message })
    fatal++
    return undefined
  }
  let xml: string
  try {
    xml = readXml(file)
  } catch (e) {
    return fail(`cannot read file: ${(e as Error).message}`)
  }
  if (!xml.trim()) return fail('file is empty')

  const errors: string[] = []
  let doc
  try {
    // xmldom reports some errors via onError and throws on fatal ones
    doc = parseXml(xml, (m) => errors.push(m))
  } catch (e) {
    errors.push((e as Error).message)
  }
  if (errors.length || !doc?.documentElement) {
    if (!errors.length) errors.push('no root element')
    const msgs = [...new Set(errors.map((m) => m.split('\n')[0].trim()))]
    const hint = msgs.some((m) => /root element/.test(m)) ? ' (file does not start with an XML element: not XML, or wrong encoding?)' : ''
    return fail('XML parse error: ' + msgs.join('; ') + hint)
  }
  return doc.documentElement as unknown as El
}

/** Reads UTF-8 (with or without BOM) and UTF-16 files (as saved by some Windows editors). */
function readXml(file: string): string {
  const buf = readFileSync(file)
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2)).swap16().toString('utf16le')
  const s = buf.toString('utf8')
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
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
if (fatal) {
  console.error(`\nBuild failed: ${fatal} file(s) could not be read or parsed (see "XML parse error" / "file is empty" above).`)
  process.exit(1)
}
