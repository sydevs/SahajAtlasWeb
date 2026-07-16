import { QueryClient } from '@tanstack/react-query'

// One QueryClient shared between the React tree (providers.tsx) and the data
// layer (config/api). The hierarchy fetchers read the already-loaded geojson
// feed from this cache instead of re-fetching + re-parsing it on every
// navigation (see fetch.ts `loadGeojson`).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
})

// The geojson feed is map-wide and changes rarely; treat it as fresh for a few
// minutes so the map and the hierarchy fetchers share a single fetch + parse.
export const GEOJSON_STALE_TIME = 5 * 60 * 1000

// The wholesale region tree changes on a slower cadence than events (regions are
// added rarely); keep it fresh far longer so navigation never re-reads /regions
// within a session — the whole point of caching it once.
export const REGIONS_STALE_TIME = 30 * 60 * 1000
