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
- **Nuxt 4 / Vue 3.** Icons: **Lucide** (`lucide-vue-next`, slim strokes: `.lucide { stroke-width: 1.5 }`; no other icon sets, no inline SVG icons). Search: plain substring scan in `shared/search.ts` (no search library; see Search). Map: **MapLibre** (planned). Person network: **sigma.js 4** (+ graphology, layout with **d3-force**), loaded client-only.
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
- The persons list uses the same `SearchField` (full width) and matching rule as the charter search, over names and
  alternate spellings. It is grouped by first letter (diacritics folded), with a letter jump bar; a Lucide icon before
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
- Legend toggles highlighting per category; "Line breaks", "Glossary" and "Source" are toggle buttons
  (coloured when on, grey when off). Glossary and Source (all `sourceDesc` fields: summary, charter, manuscript,
  physical description) are side panels that slide in over the facsimile; only one is open at a time.
- The facsimile pane shows one page, filling the pane; a pager with page tiles at the bottom
  (arrow keys when focused) switches pages and follows the transcript scroll.
- Choose-one controls (view switch, steps, sex filter) use `RadioGroup.vue` (segmented `view-switch` look,
  `role="radiogroup"`, arrow keys move the selection).
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

- The person page toggles **Charters | Charter Graph | Relations Graph** (`?view=graph`, `?view=relations`, pushes a
  history entry). Both graphs are the same component (`PersonGraph.vue`, `mode="charters" | "relations"`) with the same
  toolbar, interaction, hiding and layout; the Relations Graph simply follows explicit relations only.
- Steps (`?depth=`): Charter Graph 1–5, default 1; Relations Graph one button per step the relations reach (from
  `useRelationTree`, however many), default all. Switching the view resets the depth to the view's default.
- Charter Graph: a link is co-occurrence in a charter or an explicit `relation` from the index. Drawn lines: all links
  of the centre person, from step 2 on the link each person was reached through, and explicit relations between any
  two persons shown (all co-occurrences would be a hairball: every charter is a clique).
- Layout: **d3-force** (sigma has no layout of its own; ForceAtlas2 cannot set a target distance), started from a
  radial tree. The centre person is fixed in the middle (it cannot be dragged; dragging it pans) and is the
  **repulsion centre**: everyone is pushed away from it (`forceOutward`) and from each other (many-body, no distance
  limit). **Only lines attract**:
  - relation lines are springs, as long as their label plus room;
  - charter lines (to the centre, or to the person reached from) are **ropes** (`forceRope`, a hard maximum
    distance, slack when shorter, never pushing): shorter the more charters they stand for, so close persons stay
    near and weak ties drift out.
  - **Islands** (persons joined by relations, not counting the centre) hang from one rope only: none if a member
    is related to the centre, else the rope of the member nearest the centre with the most relations. The other
    members' charter lines are drawn but pull nothing, so e.g. a person's dependants form a ring on the far side of
    that person, away from everyone else, also when the person is dragged further out.
  - **Fans**: who hangs on whom is found breadth-first from the centre along springs and ropes; a person hanging
    on someone other than the centre is drawn to the point straight beyond that person, seen from the centre
    (`forceFan`), and its siblings push each other apart, so relatives fan out on the far side. The outward push
    alone cannot do that: it is the same for a person and its relatives, so a group that flew out left its relatives
    hanging on the inner side.
  - The simulation runs 500 ticks before showing. It never comes fully to rest (the one-sided fan and rope forces
    keep it slowly turning while hot), so reheating it would visibly move everything.
- **Dragging pauses the simulation** (`useLiveLayout`): the dragged person and everyone hanging on it (recursively,
  except pinned persons) move together, nobody else moves. On drop the person is **pinned** (ring around the circle)
  and the simulation continues gently (alpha 0.1), so its relatives turn to the far side again; a double click
  releases a pin; pins are stored per diagram and person in `localStorage`
  (`monastic-economies:pins:graph:<id>`, `…:relations:<id>`). A changed graph (steps, hiding) starts from the
  previous positions.
- Line thickness = number of shared charters (square-root scale). Explicit relations
  are accent-coloured lines labelled with the relation names as chips (`--relation-chip` background, padding; sigma
  4 draws edge label backgrounds without rounded corners); one line per pair with all names, directed ones get an
  arrow head (active → passive), at both ends when relations go both ways. Relation labels are forced visible
  (`labelVisibility: "visible"`): sigma 4 otherwise only labels edges whose two nodes show their labels, so zooming
  in (one end off screen) dropped them.
- Circles by `@sex`: `--male` blue, `--female` pink, `--sex-unknown` grey. The centre person keeps its sex colour and
  gets a strong ring in `--text` (dark on light, light on dark).
- Both diagrams share `usePersonSigma`: drag a person (circle or name) to move and pin it, click selects it (click again or on
  the background to clear; not in the URL), **Ctrl/⌘-click opens** the person, **Alt-click hides** them in the graph
  (`?hide=a,b`; hidden persons are not followed to further steps). Hidden persons are remembered per person in
  `localStorage` (`monastic-economies:hidden:<id>`) and restored when the URL has no `?hide=`; the toolbar shows
  "N persons hidden" (click shows them all again). Hiding is shared by both graphs. Hovered,
  selected and list-hovered persons are highlighted with their lines; their list row gets a subtle border (selected
  rows also a background and scroll into view).
- Labels: the first name only, centred below the circle. On highlight, alternate spellings appear below the name in
  smaller type (`PersonTips`, an HTML box over the label; sigma's label attachments made other labels vanish).
- **Filters** (`useGraphFilters`), shared by all persons and both graphs, kept in `localStorage` (not in the URL), so a
  choice such as "family only" stays when moving from person to person and after a reload:
  - **Legend** (bottom right over the graph): every relation type in the index, plus "shared charters" in the Charter
    Graph. Clicking an entry switches it off/on (`monastic-economies:graph-relations-off`), "Show all" resets. Persons
    are only reached through the link types left on; the rest drop out (and are greyed in the lists). Switching off
    "shared charters" is what "Hide unrelated" used to do.
  - **Sex filter** (toolbar): a radio group ♂ / ♀ / ? / – (`monastic-economies:graph-sex`): one sex is shown, everyone
    else is drawn in `--graph-faded` with their lines (no new layout), the centre person too (it keeps its ring).
    "?" = no `@sex` or neither male nor female (e.g. ISO 5218 0 or 9); "–" = all (the default).
- The list next to the Charter Graph has three sections: **Related** (explicit relation), **Unrelated** (only shared charters),
  **Hidden** (all of `?hide=`, with "Show all"); each row has an eye toggle and a dot in the person's graph colour.
- Names: there are no surnames. `<name>` elements (or the `persName` text) are split on commas; the first name is
  the name, every further one is an alternate spelling with no extra information, shown only on hover (diagram
  label box, `title` in lists) and matched by the persons search.
- The list next to the Relations Graph groups everyone within the chosen steps by shortest path ("Direct relations",
  "2 steps", …; by name within a group; recomputed without hidden persons, as they cut paths), each with their
  relations ("parent of Odo", "has parent Hugo"), an eye toggle, and a Hidden section.
- sigma 4: options are `{ primitives, styles, settings }` (settings are nested!). Sizes are pixels only with
  `itemSizesReference: "screen"`; the v4 default (`"positions"`) blows every circle up to fill the canvas.
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

- Work on a branch and open a pull request against `main`. Branch names say what the change is:
  `feat-<topic>` for features, `fix-<topic>` for bugs (e.g. `feat-map`, `fix-missing-charter-description`).
- Before pushing: `npm run format:check` and `npm run generate:sample` (must prerender without errors);
  check UI changes in a browser on desktop and phone width.
- Never commit real data, `build-report.json` or `public/data`.
