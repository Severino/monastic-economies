// MiniSearch options must be identical when building and loading the index.
export const SEARCH_OPTIONS = {
  fields: ['title', 'text', 'persons', 'places'],
  storeFields: ['title'],
  searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 2, persons: 1.5, places: 1.5 } },
}
