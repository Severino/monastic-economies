// Serves the generated JSON (public/data) to useAsyncData during prerendering.
// In the browser, pages read the data from the prerendered payloads instead,
// so this route is only needed at build time and in `nuxt dev`.
export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path') ?? ''
  if (!/^[\w./-]+\.(json|geojson)$/.test(path) || path.includes('..'))
    throw createError({ statusCode: 400 })
  const data = await useStorage('assets:data').getItem(path.replace(/\//g, ':'))
  if (data == null) throw createError({ statusCode: 404, statusMessage: `data/${path} not found` })
  return data
})
