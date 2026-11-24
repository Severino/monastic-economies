# AGENTS.md

Working agreements for this repository, for people and coding agents alike.
Keep this file up to date when a decision changes.

## Project

Static website for the Fulda and Farfa charters (Monastic Economies): facsimiles,
transcriptions, persons, places and legal actions, built from the project's TEI XML.
UI language: **English**.

## Architecture (decided)

- **Static only.** No database, no application server. `nuxt generate` prerenders every page;
  the output (`.output/public`) is served by **Apache** (`public/.htaccess`).
- **Build-time XML processing in TypeScript** (`scripts/build-data`, `@xmldom/xmldom`).
  No SaxonJS/XSLT. TEI → JSON in `public/data`, then Nuxt renders from that JSON.
- **Nuxt 4 / Vue 3.** Icons: **Lucide** (`lucide-vue-next`, slim strokes: `.lucide { stroke-width: 1.5 }`; no other icon sets, no inline SVG icons). Search: plain substring scan in `shared/search.ts` (no search library; see Search). Map: **MapLibre** (planned). Person network: **sigma.js 3** (+ graphology), loaded client-only.
- During prerendering, data is read through `server/api/data/[...path]` (Nitro server assets);
  in the browser, pages use the prerendered payloads. Only the search data (`search.json`) and the person network for the graph (`network.json`) are fetched from `/data/`.

## Data

- `data/` = real working data, **git-ignored, never commit it**.
  `fixtures/` = small **pseudonymized** sample set, committed, used for development, tests and CI.
  Same layout in both: `xml/<collection>/*.xml` (folder name = collection), `indices/*.xml`.
- Build scripts take `--data <dir>` (default `./data`); `*:sample` npm scripts use `fixtures/`.
- Person/place/org IDs are **global across charters**. Charter id = `{collection}-{file name}` (e.g. `fulda-001`).
- Index files come from `<data>/indices/` **and** from wherever charters link to them
  (`xi:include/@href`, `text/@xml:base`). The build prints which index files it used.
- `fixtures/indices/placeholder-indices.xml` is generated stand-in data. Never use it with real data.
- Coordinates: `<geo decls="WGS84/y-x">` holds "lat, lon" or WKT-like `Point(lat lon)`; the order follows `@decls`.
- Books are derived from `msDesc/msIdentifier/idno` (book page postponed, keep it in mind).
- Facsimile images belong to **pages** (`surface`), not charters; one page can belong to several charters.
- When real data shows a structure the fixtures don't cover, add a pseudonymized example to `fixtures/`.
  The pseudonymize tool keeps structure, IDs and enumerated attributes and replaces all words.

## Build behaviour

- Data problems are **reported, not fatal**: they go to `./build-report.json` (git-ignored, **not deployed**,
  it contains file names and IDs). The build only fails on files that cannot be read or parsed,
  and then names each file.
- Broken references render as plain text. Refs with or without leading `#` are both accepted (and reported).
- Console output groups repeated warnings; the full list is in the report.
- Presentation-only normalisation happens at build time (e.g. joining words across `lb[@break="no"]`,
  moving block-level `lb` into the following block). Never change the text order.

## URL and state

- Every meaningful navigation changes the URL, so the back button and shared links restore the view
  (e.g. catalog filters `?person=&place=&action=&q=`, `?page=3r`, `?view=running`, `?preview=`,
  person page `?view=graph`).
- Select-type filters `push` a history entry; typing in the search box only `replace`s.
- Planned **page stack** (not built yet): `?stack=persons:hugo1,places:alsace`. Therefore views
  (`CharterView`, `PersonView`, `PlaceView`) are self-contained and load their own data by id, so they
  can be rendered as a route or as a stacked overlay.
- Per-viewer preferences live in `localStorage` (legend toggles, selected action per charter).
  Always wrap access in `try/catch` and read it after hydration (`onMounted`), so SSR and client match.

## Search

- Charter search (`shared/search.ts`): every word must occur (AND) **anywhere inside a word** ("33" finds "033"),
  ignoring case and diacritics; no fuzzy matching. Chosen over word-prefix search (MiniSearch) because it is what
  people expect. Highlighting uses the same rule, so what is marked is what matched.
- Results show title and issuer on one line (no "Issuer:" label), a text snippet around the first match
  with `<mark>` and the number of matches. Action types in lists are subdued (muted colour with alpha).
- Catalog layout: "Reset filters" button right of the page title (greyed out when nothing is set); the search field
  (magnifier icon) fills the first row; person, place and action filters share the second row evenly. Filters are
  `FilterSelect` dropdowns with their own text filter (same matching rule as the search) and keyboard support.
- The persons list is grouped by first letter (diacritics folded), with a letter jump bar; a Lucide icon before
  each name shows `@sex` (Mars, Venus, faint dashed circle when unknown).

## UI conventions (charter view)

- Highlighted text has **no underlines**. Persons, places and organisations are marked by colour only;
  issuers are bold.
- Actions (`rs[@type]`) are subtle: grey background in the text, small grey uppercase badges in the header,
  plain small uppercase text in lists (no badge styling). Hover highlights in yellow; a badge click jumps to
  the next occurrence and keeps it highlighted until the next click.
- Page breaks render on their own line; line numbers always sit next to their line.
- Header is sticky. First row: collection and charter number left; manuscript shelfmark, date, folios and language
  right, each as a Lucide icon + plain text (no badge styling; language uppercase).
- Below the transcript a footer shows manuscript (`msIdentifier`), `respStmt`, `funder` and `publicationStmt`.
- Legend toggles highlighting per category; "Line breaks" and "Glossary" are toggle buttons
  (coloured when on, grey when off). The glossary slides in over the facsimile.
- The facsimile pane shows one page, filling the pane; a pager with page tiles at the bottom
  (arrow keys when focused) switches pages and follows the transcript scroll.
- Colours are CSS custom properties on `:root`; reuse them. Dark theme: follows the system by default; the
  theme toggle (right side of the nav bar) sets `data-theme` on `<html>` and stores it in `localStorage`
  (`monastic-economies:theme`). An inline script in `nuxt.config.ts` applies the stored choice before the first
  paint. Define new colour tokens for both themes (system-dark media query and `[data-theme="dark"]`).

## Map

- `/map` (`PlacesMap.vue`, client-only, MapLibre loaded via dynamic import): all places with coordinates,
  clustered at low zoom, circle size by number of charters. Data comes from the `places` payload, not from `places.geojson`.
- Basemap: OpenFreeMap vector styles (`positron` light, `dark` dark; free, no API key), switched with the site theme
  (`useDarkTheme`). Layers are re-added on every `style.load`. Layer colours come from the CSS tokens.
- The selected place is `?place=<id>` (push); a side panel (bottom sheet on phones) lists its charters.
- Colour by number of charters: grey for 0, then blue (1) → purple (3) → pink (5+), tokens `--map-0/1/3/5`
  (clusters use the summed count). Places without charters are hidden by default; the control box (bottom right)
  has the legend and a toggle for them, stored in `localStorage` (`monastic-economies:map-show-empty`).

## Person graph

- The person page toggles **Charters | Graph** (`?view=graph`, pushes a history entry).
- Graph = network around the person, **1–5 steps** (`?depth=`, default 1). A link is co-occurrence in a charter
  or an explicit `relation` from the index. Layout is a radial tree: ring = step, each person sits in the sector of
  the person it was reached from (strongest link). Drawn lines: all links of the centre person, and from step 2 on
  only the link each person was reached through (all links would be a hairball: every charter is a clique).
- Line thickness = number of shared charters (square-root scale; hover a line for the count). Explicit relations
  are accent-coloured lines labelled with the relation name; directed ones get an arrow head (active → passive),
  at both ends when relations go both ways.
- Click a person in the graph to hide them (`?hide=a,b`, kept when moving to another person); hidden persons are
  not followed to further steps. Ctrl/⌘-click opens the person. The list next to the graph has an eye toggle per row.
- Names in the graph and its list: first word bold, the rest of the name below in normal weight (`splitName`; the
  index has no separate name parts).
- The graph reads `network.json` (compact, persons only, written by the build) in the browser. The list of direct
  connections next to it is computed from `relations.json` while prerendering (`useEgoNetwork`), so it is in the
  page payload. Graph colours are read from the CSS tokens and re-read when the theme changes.

## Code style

- **Indentation: 4 spaces** (JSON, Markdown and YAML: 2).
- **CSS: one declaration per line**, never several declarations on one line.
- Formatting is enforced with Prettier (`.prettierrc.json`, `.editorconfig`):
  run `npm run format` before committing; `npm run format:check` must pass.
- TypeScript everywhere; shared types live in `shared/types` and are used by both the build script and the app.
- No semicolons, double quotes (Prettier config).

## Workflow

- Work on a branch and open a pull request against `main`.
- Before pushing: `npm run format:check` and `npm run generate:sample` (must prerender without errors);
  check UI changes in a browser on desktop and phone width.
- Never commit real data, `build-report.json` or `public/data`.
