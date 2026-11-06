import type { OpenFullView } from './parts'

import { useTranslation } from 'react-i18next'
import { ChevronRight, Maximize } from 'lucide-react'

import { OnlineRow, SearchInput, ipOrigin, useFeed, useNearest, useOnlineCount } from './parts'

import { listRow } from '@/components/molecules/List/List'
import { useBrandPalette } from '@/config/theme/brand-palette'
import { SOLID_STEP, stepHex } from '@/config/theme/palette'
import { useIpLocation } from '@/hooks/use-ip-location'
import { useTheme } from '@/hooks/use-theme'
import { approxBounds } from '@/lib/geo'
import { NEARBY_RADIUS_KM } from '@/lib/geolocation'
import { isoCountryCode, placeSearchPath } from '@/lib/shape'

/**
 * PROTOTYPE (`ux/embed-inline`, direction A, minimal): a still preview of the Atlas in the page.
 *
 * A strip of map over the top of the real panel. The strip is a picture (Mapbox's Static Images
 * API, the same styles as the live map), so there is nothing to drag: a finger scrolls the page
 * straight past it, and no map library loads until the visitor taps. Every tap opens the full view
 * at that place.
 */

// The same two styles `Map.tsx` draws the live map with.
const STYLES = {
  light: 'sydevadmin/ck7g6nag70rn11io09f45odkq',
  dark: 'sydevadmin/cl4nw934f001j14l8jnof3a7w',
}

/** A static map picture around `center`, with a small pin per nearby class. */
function staticMapUrl(
  theme: 'light' | 'dark',
  center: [number, number] | null,
  pins: [number, number][],
  color: string,
): string {
  const hex = color.replace('#', '')
  const overlay = pins
    .map(([lng, lat]) => `pin-s+${hex}(${lng.toFixed(4)},${lat.toFixed(4)})`)
    .join(',')
  const view = center ? `${center[0].toFixed(4)},${center[1].toFixed(4)},10.5,0` : '10,30,0.6,0'
  const token = import.meta.env.VITE_MAPBOX_ACCESSTOKEN

  return `https://api.mapbox.com/styles/v1/${STYLES[theme]}/static/${overlay ? `${overlay}/` : ''}${view}/640x200@2x?access_token=${token}`
}

export function PreviewCard({ onOpen }: { onOpen: OpenFullView }) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const palette = useBrandPalette()
  const feed = useFeed()
  const ip = useIpLocation()
  const center = ipOrigin(ip)
  const nearby = useNearest(feed, center, 12)
  const onlineCount = useOnlineCount(feed)
  const pinColor = stepHex(palette.primary, theme, SOLID_STEP) ?? '#21C1A2'

  const nearRoute =
    ip && center
      ? placeSearchPath(new URLSearchParams(), {
          q: `${ip.city}, ${ip.country}`,
          center,
          bbox: approxBounds(center, NEARBY_RADIUS_KM),
          countryCode: isoCountryCode(ip.country_code),
        })
      : null

  return (
    <section
      aria-labelledby="sy-preview-heading"
      className="flex w-full flex-col overflow-hidden bg-background text-foreground"
    >
      {/* The picture is a button: one obvious target that says what it opens. */}
      <button
        className="group relative block h-[168px] w-full overflow-hidden bg-gray-3"
        type="button"
        onClick={() => onOpen(nearRoute ?? '/')}
      >
        {feed && (
          <img
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={staticMapUrl(
              theme,
              center,
              nearby.map(({ feature }) => feature.geometry!.coordinates),
              pinColor,
            )}
          />
        )}
        <span className="absolute end-3 bottom-3 inline-flex h-10 items-center gap-2 rounded-full bg-background px-4 text-sm font-medium text-foreground shadow-md transition-colors group-hover:bg-gray-2">
          <Maximize aria-hidden size={16} />
          {t('compact.open_map')}
        </span>
      </button>
      <h2 className="px-4 pt-4 pb-3 text-xl font-semibold" id="sy-preview-heading">
        {t('common.chrome.widget_label')}
      </h2>
      <div className="px-4 pb-2">
        <SearchInput onOpen={onOpen} />
      </div>
      {nearRoute && ip && (
        <button
          className={listRow({
            className: 'flex min-h-14 w-full flex-row items-center py-1.5 text-start',
          })}
          type="button"
          onClick={() => onOpen(nearRoute)}
        >
          <span className="min-w-0 flex-grow text-lg font-semibold">
            {t('countries.near_city', { city: ip.city })}
          </span>
          <ChevronRight aria-hidden className="shrink-0 text-gray-9 rtl:-scale-x-100" size={20} />
        </button>
      )}
      <div className="border-t border-divider pb-2">
        <OnlineRow count={onlineCount} onOpen={onOpen} />
      </div>
    </section>
  )
}
