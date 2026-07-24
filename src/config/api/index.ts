import fetch from './fetch'
import mutate from './mutate'

import { REGIONS_STALE_TIME } from '@/config/query-client'

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

// The wholesale region-tree query contract in one place — shared by the region
// matcher, the Region filter's options, and the region-pill name lookup so the key +
// fetcher + stale window can't drift. Locale-agnostic (region names ride the tree
// as-is), so no locale in the key.
export const regionsQuery = () => ({
  queryKey: ['regions'] as const,
  queryFn: () => api.getRegions(),
  staleTime: REGIONS_STALE_TIME,
})

export default api
