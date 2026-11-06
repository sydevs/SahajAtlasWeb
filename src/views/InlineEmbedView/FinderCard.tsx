import type { GeoFeature } from '@/types'
import type { Nearby, OpenFullView } from './parts'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'

import { OnlineRow, SearchInput, ipOrigin, useFeed, useNearest, useOnlineCount } from './parts'

import { Button } from '@/components/atoms/Button'
import { Spinner } from '@/components/atoms/Spinner'
import { listRow } from '@/components/molecules/List/List'
import { eventTitlesQuery } from '@/config/api'
import { composeCalendarLine, useEventDisplay } from '@/hooks/use-event-display'
import { useIpLocation } from '@/hooks/use-ip-location'
import { useLocale } from '@/hooks/use-locale'
import { formatDistance } from '@/lib'
import { approxBounds } from '@/lib/geo'
import { NEARBY_RADIUS_KM } from '@/lib/geolocation'
import { NEARBY_KM, isoCountryCode, placeSearchPath, safePath } from '@/lib/shape'

/**
 * PROTOTYPE (`ux/embed-inline`, direction B): what an in-page slot shows instead of a map.
 *
 * It answers "when and where can I go?" in the page itself: up to three nearest classes with their
 * time, name and place, a search field, the way to use your real location, online classes and the
 * map. Nothing in it captures a drag, so the page scrolls straight over it. Every tap opens the
 * full view at that place.
 *
 * The nearest classes come from the same feed and the same IP guess the panel's first screen
 * already reads; the device's location is asked for only when "Use my location" is tapped. The
 * guess names its city in the heading so a wrong one is easy to see and correct.
 */

type Origin =
  | { kind: 'ip'; at: [number, number]; city: string; country: string; code?: string }
  | { kind: 'device'; at: [number, number] }

/**
 * One class: when, then which class, then where (and how far). Two classes can share an address
 * and an hour (a Czech and an English one at Lipanská), so the row names the class; until the
 * titles arrive, its language tells them apart.
 */
function ClassRow({
  feature,
  km,
  title,
  heading,
  onOpen,
}: {
  feature: GeoFeature
  km: number
  title: string | undefined
  /** Opens a group of its own above this row ("Classes in other cities"). */
  heading?: string
  onOpen: () => void
}) {
  const { locale, languageLabel } = useLocale()
  const { recurrenceLine, whenLine, eventStartTime, display, whereLine } = useEventDisplay(
    feature.properties,
  )
  const when = composeCalendarLine({
    recurrenceLine,
    whenLine,
    time: eventStartTime,
    hasNext: Boolean(display.next),
  })
  const name = title || feature.properties.languages.map(languageLabel).join(', ')

  return (
    <li className="flex min-w-0 flex-col">
      {heading && <p className="px-gutter pt-3 text-sm font-semibold text-gray-11">{heading}</p>}
      {/* `flex-1`, not `h-full`: beside a heading, a full-height row would overflow its cell. */}
      <button
        className={listRow({
          className: `flex min-h-14 w-full flex-1 flex-row items-center gap-2 py-2.5 text-start @min-[560px]:items-start @min-[560px]:py-3 ${heading ? 'pt-1 @min-[560px]:pt-1' : ''}`,
        })}
        type="button"
        onClick={onOpen}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-semibold">{when}</span>
          {name && <span className="truncate text-sm">{name}</span>}
          <span className="flex min-w-0 gap-1 text-sm text-gray-11 @min-[560px]:flex-col @min-[560px]:gap-0.5">
            <span className="truncate @min-[560px]:line-clamp-2 @min-[560px]:whitespace-normal">
              {whereLine}
            </span>
            <span className="shrink-0 tabular-nums">
              <span aria-hidden className="@min-[560px]:hidden">
                ·{' '}
              </span>
              {formatDistance(km, locale)}
            </span>
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="shrink-0 text-gray-9 @min-[560px]:hidden rtl:-scale-x-100"
          size={20}
        />
      </button>
    </li>
  )
}

/**
 * The nearest classes, a farther town's set apart under its own heading: "near Prague" is the
 * town and its edges (`NEARBY_KM`), and Liberec, 89 km away, is another city.
 */
function Rows({
  rows,
  titles,
  onOpen,
}: {
  rows: Nearby[]
  titles: Map<number, string> | undefined
  onOpen: OpenFullView
}) {
  const { t } = useTranslation()
  const firstFarther = rows.findIndex(({ km }) => km > NEARBY_KM)

  return (
    <ul className="m-0 grid list-none grid-cols-1 p-0 @min-[560px]:grid-cols-3 [&>li+li]:border-t [&>li+li]:border-divider @min-[560px]:[&>li+li]:border-s @min-[560px]:[&>li+li]:border-t-0">
      {rows.map(({ feature, km }, i) => (
        <ClassRow
          key={feature.properties.id}
          feature={feature}
          heading={i === firstFarther ? t('search.sections.nearby') : undefined}
          km={km}
          title={titles?.get(feature.properties.id)}
          onOpen={() => onOpen(safePath(feature.properties.webPath) ?? `/${feature.properties.id}`)}
        />
      ))}
    </ul>
  )
}

/** Three rows' worth of quiet placeholder, so the card doesn't jump when the feed lands. */
function RowsSkeleton() {
  return (
    <ul aria-hidden className="m-0 grid list-none grid-cols-1 p-0 @min-[560px]:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex min-h-14 flex-col justify-center gap-2 px-4 py-2.5">
          <span className="h-4 w-2/5 rounded bg-gray-3" />
          <span className="h-3 w-1/2 rounded bg-gray-3" />
          <span className="h-3 w-3/5 rounded bg-gray-3" />
        </li>
      ))}
    </ul>
  )
}

export function FinderCard({ onOpen }: { onOpen: OpenFullView }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const feed = useFeed()
  // The one localized feed field, a small read the full view needs anyway.
  const { data: titles } = useQuery(eventTitlesQuery(locale))
  const ip = useIpLocation()
  const [device, setDevice] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState<'idle' | 'busy' | 'failed'>('idle')

  const origin: Origin | null = device
    ? { kind: 'device', at: device }
    : ip
      ? {
          kind: 'ip',
          at: ipOrigin(ip)!,
          city: ip.city,
          country: ip.country,
          code: isoCountryCode(ip.country_code),
        }
      : null
  const rows = useNearest(feed, origin?.at ?? null)
  const onlineCount = useOnlineCount(feed)

  const place = origin?.kind === 'ip' ? origin.city : null
  const heading =
    origin?.kind === 'device'
      ? t('compact.near_you')
      : place
        ? t('compact.near_place', { place })
        : t('common.chrome.widget_label')

  const locate = () => {
    if (!navigator.geolocation) return setLocating('failed')
    setLocating('busy')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDevice([position.coords.longitude, position.coords.latitude])
        setLocating('idle')
      },
      () => setLocating('failed'),
      { timeout: 30000, maximumAge: 300000 },
    )
  }

  // "Open the map" opens it where the rows are: around the visitor's location or the guessed city.
  const mapRoute = origin
    ? placeSearchPath(new URLSearchParams(), {
        q: origin.kind === 'ip' ? `${origin.city}, ${origin.country}` : undefined,
        center: origin.at,
        bbox: approxBounds(origin.at, NEARBY_RADIUS_KM),
        countryCode: origin.kind === 'ip' ? origin.code : undefined,
      })
    : '/'

  const nothingNear = Boolean(feed && origin && rows.length === 0)

  return (
    <section
      aria-labelledby="sy-finder-heading"
      className="@container flex w-full flex-col overflow-hidden bg-background text-foreground"
    >
      <div className="flex flex-col gap-1 px-4 pt-4 @min-[560px]:flex-row @min-[560px]:items-baseline @min-[560px]:justify-between @min-[560px]:gap-4">
        <h2 className="text-xl font-semibold text-balance" id="sy-finder-heading">
          {heading}
        </h2>
        {/* One quiet line that keeps the guess honest, and asks for the real location only now. */}
        <div className="flex min-h-11 items-center text-sm text-gray-11 @min-[560px]:shrink-0">
          {locating === 'busy' ? (
            <span className="flex items-center gap-2" role="status">
              <Spinner size="sm" />
              {t('countries.locating')}
            </span>
          ) : locating === 'failed' ? (
            <p role="alert">{t('common.map.location_failed')}</p>
          ) : origin?.kind === 'device' ? null : (
            <button className="min-h-11 text-start" type="button" onClick={locate}>
              {place && <>{t('countries.not_in_city', { city: place })} </>}
              <span className="text-primary-11 underline-offset-4 hover:underline">
                {t('countries.use_location')}
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="px-4 pt-1 pb-3">
        <SearchInput onOpen={onOpen} />
      </div>
      {!feed ? (
        <RowsSkeleton />
      ) : nothingNear ? (
        <p className="px-4 py-3 text-base text-gray-11">
          {place ? t('compact.none_near', { place }) : t('compact.none_near_you')}
        </p>
      ) : !origin ? (
        <p className="px-4 py-3 text-base text-gray-11">{t('compact.no_place')}</p>
      ) : (
        <Rows rows={rows} titles={titles} onOpen={onOpen} />
      )}
      <div className="border-t border-divider @min-[560px]:flex @min-[560px]:items-center @min-[560px]:justify-between @min-[560px]:pe-4">
        <div className="@min-[560px]:min-w-0 @min-[560px]:flex-1">
          <OnlineRow count={onlineCount} onOpen={onOpen} />
        </div>
        <div className="px-4 pt-1 pb-4 @min-[560px]:p-0">
          <Button
            className="h-11 w-full @min-[560px]:w-auto"
            color="primary"
            variant="bordered"
            onClick={() => onOpen(mapRoute)}
          >
            {t('compact.open_map')}
          </Button>
        </div>
      </div>
    </section>
  )
}
