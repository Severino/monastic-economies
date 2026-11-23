# Datenmodell v0.1 (Entwurf)

Stand: 2026-11-23. Grundlage: 3 pseudonymisierte Fulda-Urkunden (001–003), `fnf-main.xsd`, `fnf-restrictions.xsd`.
Stack: Nuxt (`nuxt generate`), TypeScript-Build-Skript (Variante B), Textsuche per Teilstring-Suche (ursprünglich MiniSearch), MapLibre, sigma.js, Apache.

## 1. Befunde aus den Beispieldaten

### Fehlt noch

- **Index-Datei(en).** Personen, Orte, Organisationen und Relationen stehen nicht in den Urkunden, sondern kommen über `<xi:include>` aus einer zentralen Datei (`text/@xml:base="../fulda-indices.xml"`). Ohne sie gibt es keine Namen, Koordinaten oder Relationen. Vermutlich gibt es ein Gegenstück für Farfa.
- Das Skript hatte `xi:include/@href` und `@ref`-Werte ohne `#` mit pseudonymisiert. Das ist behoben. Bitte die Dateien mit demselben Salt **neu erzeugen**, damit die Referenzen stimmen.

### Struktur (wichtig fürs Modell)

| Beobachtung                                                                                                                                                                   | Folge                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `msDesc/msIdentifier` (`idno` „Pu 424“, `msName`) ist bei allen drei Urkunden gleich, `msPart/msIdentifier/idno` ist die Urkundennummer                                       | **Bücher lassen sich automatisch ableiten**: Buch = `msIdentifier/idno`. Eine Liste der Urkunden pro Buch gibt es ohne Zusatzaufwand, nur die Beschreibung fehlt.  |
| Faksimile-Seiten werden geteilt (2v steht in 001 und 002), Urkunden beginnen mitten auf der Seite (`locus from="2v18"`)                                                       | Bilder werden **pro Seite** gespeichert, nicht pro Urkunde. Der Viewer zeigt die Seiten der Urkunde. Ohne Zeilenkoordinaten können wir nicht auf die Zeile zoomen. |
| `lb/@n` beginnt auf jeder Seite neu, `break="no"` steht mitten im Wort                                                                                                        | Renderer und Suchtext müssen solche Wörter ohne Leerzeichen zusammenfügen.                                                                                         |
| `rs` ist mehrfach belegt: Entität (`@ref`), Rolle (`@role`), Aktions- oder Maßangabe (`@type`, Liste), Fußnotenanker (`@xml:id`, auch leer); verschachtelt bis zu drei Ebenen | Eine rekursive Renderer-Komponente, die alle Kombinationen abdeckt                                                                                                 |
| Die Rolle hängt an der Erwähnung, nicht an der Person (Hugo ist in 002 `issuer`)                                                                                              | Die Verknüpfung Person ↔ Urkunde trägt die Rollen.                                                                                                                 |
| `role="placeIssue"` / `possession` / `beneficium` an Orten                                                                                                                    | Auf der Karte lassen sich Ausstellungsorte und Besitz getrennt darstellen.                                                                                         |

### Datenfehler (der Build meldet sie und bricht nicht ab)

- `@ref` ohne `#` (6× in 001/002). Der Build akzeptiert beide Formen und meldet die fehlenden `#`.
- 003: `<pb facs="f-3v">` ohne `#`, und `surface f-3v` fehlt in `<facsimile>`.
- 003: `lb n="24"` kommt doppelt vor.
- Schemaverstöße laut `xmllint`: `rs` in `note` (002), `bibl` in `note` (001), `xi:include` nach `standOff`. Entweder ist das Schema zu streng, oder die Daten sind falsch. **Das müssen die Wissenschaftler entscheiden.**
- `textLang` = „latin“, `body/@xml:lang` = „lat“. Das ist uneinheitlich.

## 2. Ausgabe des Builds (`public/data/`)

| Datei                                      | Inhalt                                          | Geladen von                   |
| ------------------------------------------ | ----------------------------------------------- | ----------------------------- |
| `charters/{id}.json`                       | vollständige Urkunde inkl. Textbaum             | Urkundenseite, Vorschau       |
| `catalog.json`                             | schlanke Liste aller Urkunden für Filter        | Katalog, Personen-/Ortsseiten |
| `persons.json`, `places.json`, `orgs.json` | Entitäten inkl. Rückverweisen                   | Entitätsseiten, Tooltips      |
| `relations.json`                           | explizite Relationen + abgeleitete Ko-Okkurrenz | Graph                         |
| `books.json`                               | Bücher + geordnete Urkunden-IDs                 | Buchseite (später)            |
| `places.geojson`                           | Orte mit Koordinaten                            | Karte                         |
| `search.json`                              | Titel, Text und Namen je Urkunde                | Suche                         |
| `build-report.json`                        | Validierungs- und Datenfehler                   | Entwickler / Wissenschaftler  |

Bei 100+ Urkunden bleibt alles im niedrigen MB-Bereich. `nuxt generate` legt die Daten zusätzlich als Payload in die vorgerenderten Seiten.

## 3. Typen (Entwurf)

```ts
type Id = string // xml:id aus dem Index, z. B. "hugo1"
type CharterId = string // z. B. "fulda-001" (siehe Frage 2)

interface DateSpec {
  when?: string
  from?: string
  to?: string
} // ISO, z. B. "0785-06-19"

interface Charter {
  id: CharterId
  bookId: string // msDesc/msIdentifier/idno
  number: string // msPart/msIdentifier/idno
  altNumber?: string // altIdentifier/idno
  title: string
  date: DateSpec // msItem/docDate
  locus: { from: string; to: string } // "2v18" -> Seite 2v, Zeile 18
  language: string
  summary?: Node[]
  physDesc: { hand?: string; script?: Node[]; additions?: Node[] }
  pages: PageRef[] // aus facsimile, in Reihenfolge
  body: Node[] // Textbaum, siehe unten
  notes: Record<string, Node[]> // fn-ID -> Fußnote (listAnnotation)
  mentions: Mention[] // abgeleitet aus rs[@ref]
  actions: Action[] // abgeleitet aus rs[@type]
  plainText: string // für die Suche, break="no" aufgelöst
}

interface PageRef {
  id: string
  label: string
  image: string
  iiif?: string
}

interface Mention {
  ref: Id
  kind: "person" | "place" | "org" | "unresolved"
  role?: string
  section?: string
}
interface Action {
  types: string[]
  section?: string
  text: string
} // z. B. ["land","unrestrictedUse"]

// Textbaum: kompakt, wird von <TeiNode> rekursiv gerendert
type Node =
  | string
  | {
      t:
        | "div"
        | "ab"
        | "head"
        | "rs"
        | "lb"
        | "pb"
        | "cb"
        | "date"
        | "hi"
        | "ref"
        | "add"
        | "del"
        | "subst"
        | "supplied"
        | "sic"
        | "metamark"
        | "choice"
        | "seg"
      a?: Record<string, string> // type, role, ref (normalisiert ohne '#'), n, break, rend …
      c?: Node[]
    }

interface Person {
  id: Id
  name: string
  altNames: string[]
  roleName?: string
  sex?: string
  socecStatus?: string
  affiliations: { type: string; ref?: Id; label: string }[]
  note?: Node[]
  charters: { id: CharterId; roles: string[] }[]
}

interface Place {
  id: Id
  names: { lang?: string; name: string }[]
  types: string[] // casalis, monastery …
  coords?: [lon: number, lat: number] // aus "WGS84/y-x" "lat, lon" umgedreht für GeoJSON
  coordSource?: string
  cert?: string
  charters: { id: CharterId; roles: string[] }[]
}

interface Relation {
  name: string
  category?: "family" | "social"
  active?: Id[]
  passive?: Id[]
  mutual?: Id[]
}
// Graph zusätzlich: Ko-Okkurrenz-Kanten (Personen in derselben Urkunde) mit Gewicht, im UI zuschaltbar

interface CatalogEntry {
  id: CharterId
  title: string
  date: DateSpec
  bookId: string
  persons: Id[]
  places: Id[]
  actionTypes: string[]
  issuer?: Id[]
}
```

## 4. Umsetzung in Nuxt

- **Build:** `scripts/build-data.ts` (läuft vor `nuxt generate`, mit `@xmldom/xmldom`). Ablauf: XInclude auflösen, mit XSD validieren (`xmllint` oder `xmllint-wasm`), parsen, normalisieren, Querverweise prüfen, JSON schreiben.
- **Routen:** `/charters/[id]`, `/persons/[id]`, `/places/[id]`, `/books/[id]`, `/map`, `/network`, `/catalog`. Die Liste für `nitro.prerender.routes` entsteht aus `catalog.json` und den Indizes.
- **Filterzustand in der URL:** Der Katalog speichert seine Filter als Query (`?person=hugo1&action=donation&q=…`), die Karte Ausschnitt und Auswahl (`?at=42.6,13.2,9&place=x`).
- **Stapel (später):** `?stack=persons:hugo1,places:alsace`. Jede Seite ist eine Komponente `<XxxView :id>`, die gleichermaßen als Route oder als Overlay gerendert werden kann.
- **Renderer:** `<TeiNode :node>` als Render-Funktion. `rs[@ref]` wird zu `<NuxtLink>` mit Hervorhebung, `rs[@type]` zur farbigen Markierung der Aktion, `rs[@xml:id]` zum Fußnotenmarker. `lb` steht wahlweise als Zeilenumbruch oder fortlaufend (umschaltbar).

## 5. Offene Fragen

1. **Index-Dateien:** Bitte `fulda-indices.xml` (und ggf. das Farfa-Pendant) pseudonymisiert schicken.
2. **Urkunden-ID:** Ich schlage `{sammlung}-{msPart-idno}` vor (z. B. `fulda-001`), weil die Nummern zwischen Farfa und Fulda kollidieren können. Woraus leite ich die Sammlung ab: aus dem Ordner, dem Index-Namen oder einem Feld?
3. **Bilder:** `graphic/@url` ist nur ein Dateiname (`2v.jpg`). Wo liegen die Bilder, und wo stehen die IIIF-Manifest-URLs, wenn es welche gibt?
4. **Datenfehler:** Mein Vorschlag ist, dass der Build Fehler im `build-report.json` sammelt und nur bei XML, das sich nicht parsen lässt, abbricht. Kaputte Referenzen werden dann als einfacher Text gerendert. Einverstanden?
