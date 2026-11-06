import type { Geojson, GeoFeature, IpLocation } from '@/types'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Search } from 'lucide-react'

import { WmIcon } from '@/components/atoms/Icons/wm'
import { listRow } from '@/components/molecules/List/List'
import api from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { distanceKm } from '@/lib/geo'
import { NEARBY_MAX_KM } from '@/lib/geolocation'
import { DEFAULT_FILTERS, filtersToParams, isOnline, resolveEventDisplay } from '@/lib/shape'

/**
 * Pieces both in-page forms share (`FinderCard`, `PreviewCard`). Module-private to this view.
 */

/** Asks the full view to open, at a route, with focus on the panel or the search field. */
export type OpenFullView = (route: string, focus?: 'panel' | 'search', query?: string) => void

/** The class feed, read once and shared with the interface the full view opens. */
export function useFeed(): Geojson | undefined {
  const { data } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  return data
}

export const ONLINE_ROUTE = `/search?${filtersToParams({ ...DEFAULT_FILTERS, format: 'online' }).toString()}`

export function useOnlineCount(feed: Geojson | undefined): number {
  return useMemo(
    () => feed?.features.filter((feature) => isOnline(feature.properties)).length ?? 0,
    [feed],
  )
}

export type Nearby = { feature: GeoFeature; km: number }

/**
 * Up to `limit` classes with a place, nearest first, within the same 100 km the near-me row uses
 * to decide whether anything is "near". Finished classes are left out.
 */
export function useNearest(
  feed: Geojson | undefined,
  origin: [number, number] | null,
  limit = 3,
): Nearby[] {
  return useMemo(() => {
    if (!feed || !origin) return []

    return feed.features
      .flatMap((feature) => {
        const at = feature.geometry?.coordinates

        if (!at || isOnline(feature.properties)) return []
        if (resolveEventDisplay(feature.properties).status === 'ended') return []

        const km = distanceKm(origin, at)

        return km <= NEARBY_MAX_KM ? [{ feature, km }] : []
      })
      .sort((a, b) => a.km - b.km)
      .slice(0, limit)
  }, [feed, origin, limit])
}

export const ipOrigin = (ip: IpLocation | null): [number, number] | null =>
  ip ? [ip.longitude, ip.latitude] : null

/**
 * The search field, as the visitor knows it from the panel: a real input, so a tap focuses it and
 * a phone raises its keyboard within that same tap (iOS won't raise it from anything later). The
 * tap then opens the full view, whose own field takes the focus over, and the keyboard stays up.
 */
export function SearchInput({ onOpen }: { onOpen: OpenFullView }) {
  const { t } = useTranslation()

  return (
    <label className="relative block">
      <span className="sr-only">{t('search.chrome.city_or_postcode')}</span>
      <Search
        aria-hidden
        className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-11"
        size={18}
      />
      <input
        className="h-11 w-full rounded-lg border border-divider bg-gray-2 ps-10 pe-3 field-size text-foreground placeholder:text-gray-11"
        data-sy-handover=""
        enterKeyHint="search"
        placeholder={t('search.chrome.city_or_postcode')}
        type="search"
        // A tap or click opens; Tab alone does not, so a keyboard visitor passing through the page
        // isn't thrown into a full-screen view. Their first keystroke opens it, and carries over.
        onChange={(event) => onOpen('/', 'search', event.currentTarget.value)}
        onClick={() => onOpen('/', 'search')}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onOpen('/', 'search', event.currentTarget.value)
          }
        }}
      />
    </label>
  )
}

/** The online classes row: the one decorative icon, as on the panel's first screen. */
export function OnlineRow({ count, onOpen }: { count: number; onOpen: OpenFullView }) {
  const { t } = useTranslation()

  if (count === 0) return null

  return (
    <button
      className={listRow({
        className: 'flex min-h-14 w-full flex-row items-center py-2 text-start',
      })}
      type="button"
      onClick={() => onOpen(ONLINE_ROUTE)}
    >
      <span className="me-3 flex h-6 w-6 shrink-0 items-center justify-center">
        <WmIcon className="text-ornament" name="meditate" size={24} />
      </span>
      <span className="min-w-0 flex-grow">
        <span className="block text-lg font-semibold">{t('online.row')}</span>
        <span className="block text-sm text-gray-11">{t('online.anywhere')}</span>
      </span>
      <span className="me-1 text-sm text-gray-11 tabular-nums">{count}</span>
      <ChevronRight aria-hidden className="shrink-0 text-gray-9 rtl:-scale-x-100" size={20} />
    </button>
  )
}
