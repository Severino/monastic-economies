# Monastic Economies

Static website for the Fulda and Farfa charters: facsimiles, transcriptions,
persons, places and legal actions, built from the project's TEI XML.

**Status: prototype.** Uses pseudonymized sample data and a *generated placeholder
index* until the real index file (`fulda-indices.xml`) is available.

## Stack

- **Build step** (`scripts/build-data`, TypeScript + `@xmldom/xmldom`): TEI XML → JSON in `public/data`
- **Nuxt 4**, fully prerendered with `nuxt generate`, deployable to any static host (Apache config in `public/.htaccess`)
- **MiniSearch** (full text), planned: **MapLibre** (map), **sigma.js** (person network)

## Getting started

```bash
npm install
npm run dev        # builds the data, then starts nuxt dev
npm run generate   # builds the data, then the static site in .output/public
npm run preview    # serves .output/public
```

## Data

```
data/xml/<collection>/*.xml   charters; the folder name is the collection ("fulda", "farfa")
data/indices/*.xml            index files (persons, places, orgs, relations); IDs are global
schema/                       XSD (fnf-main.xsd)
```

`npm run data` writes to `public/data/`:

| file | content |
|---|---|
| `charters/{collection}-{file}.json` | full charter incl. transcript tree |
| `catalog.json` | light list for filtering |
| `persons.json`, `places.json`, `orgs.json` | entities with back references to charters |
| `relations.json` | explicit relations + co-occurrence edges |
| `books.json` | books (derived from `msDesc/msIdentifier/idno`) |
| `places.geojson` | places with coordinates |
| `search-index.json` | serialized MiniSearch index |
| `build-report.json` | data problems (missing `#`, broken references, …) |

The build reports data problems but only fails on XML that cannot be parsed.
See `docs/datenmodell.md` for the data model.

`npm run data:placeholder-index` regenerates `data/indices/placeholder-indices.xml`
from the references in the charters. **Delete that file once the real index is added.**

## Structure

- `app/components/*View.vue`: self-contained views that load their data by id.
  They are rendered by the routes today and are meant to become layers of the
  planned page stack (`?stack=persons:hugo1,places:alsace`).
- `app/components/TeiNodes.ts`: recursive renderer for the transcript tree.
- All UI state that matters lives in the URL (filters, line-break mode, preview).
