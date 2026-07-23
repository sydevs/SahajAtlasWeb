import fetch from './fetch'
import mutate from './mutate'

const api = {
  ...fetch,
  ...mutate,
}

// The client-record query contract in one place — shared by AppRouter's
// suspense read and BrandTheme's non-suspense read so the key + fetcher can't
// drift between them.
export const clientQuery = (apiKey?: string | null) => ({
  queryKey: ['client', apiKey] as const,
  queryFn: () => api.getClient(),
})

// The single-event query contract in one place — shared by EventView's suspense read
// and the card hover / idle prefetch (use-prefetch-event) so the key + fetcher can't
// drift. A prefetch under a divergent key would silently never hit, so both must build
// the key here. Locale is part of the key (the detail is localized).
export const eventQuery = (id: number, locale: string) => ({
  queryKey: ['event', id, locale] as const,
  queryFn: () => api.getEvent(id),
})

export default api
