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
- **Nuxt 4 / Vue 3.** Icons: **Lucide** (`lucide-vue-next`, slim strokes: `.lucide { stroke-width: 1.5 }`; no other icon sets, no inline SVG icons). Search: plain substring scan in `shared/search.ts` (no search library; see Search). Map: **MapLibre** (planned). Person network: **sigma.js** (planned).
- During prerendering, data is read through `server/api/data/[...path]` (Nitro server assets);
  in the browser, pages use the prerendered payloads. Only the search data (`search.json`) is fetched from `/data/`.

## Data

- `data/` = real working data, **git-ignored, never commit it**.
  `fixtures/` = small **pseudonymized** sample set, committed, used for development, tests and CI.
  Same layout in both: `xml/<collection>/*.xml` (folder name = collection), `indices/*.xml`.
- Build scripts take `--data <dir>` (default `./data`); `*:sample` npm scripts use `fixtures/`.
- Person/place/org IDs are **global across charters**. Charter id = `{collection}-{file name}` (e.g. `fulda-001`).
- Index files come from `<data>/indices/` **and** from wherever charters link to them
  (`xi:include/@href`, `text/@xml:base`). The build prints which index files it used.
- `fixtures/indices/placeholder-indices.xml` is generated stand-in data. Never use it with real data.
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
  (e.g. catalog filters `?person=&place=&action=&q=`, `?page=3r`, `?view=running`, `?preview=`).
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
