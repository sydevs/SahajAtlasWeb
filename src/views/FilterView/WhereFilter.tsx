import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { LocateFixed, X } from 'lucide-react'
import clsx from 'clsx'

import { Button } from '@/components/atoms/Button'
import { LocationHelp } from '@/components/molecules/LocationHelp'
import { regionsQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { useNearMe, useNearVisitor } from '@/hooks/use-near-me'
import { useLocale } from '@/hooks/use-locale'
import { formatDistance } from '@/lib'
import { regionalLocale } from '@/lib/time'
import { overlayContainer } from '@/lib/overlay'
import { NEARBY_KM, type PlaceSearch, parseBounds, parseCenter, placeSize } from '@/lib/shape'

export type WhereFilterProps = {
  /** The region slug in scope, if any. */
  region: string | null
  /** Search a place. Replaces any region in scope. */
  onPlace: (place: PlaceSearch) => void
  /** Back to everywhere: drops the place and the region. */
  onClear: () => void
  /** Near me only makes sense where the results rank by place. */
  searchable?: boolean
  /** Off where the surface is already named Where (the chip on a computer). */
  titled?: boolean
  /** What a place's scope really holds, so "near" can't suggest more locality than it has. */
  counts?: { inPerson: number; online: number }
  /**
   * Where "Search instead" (after a refused location) takes the visitor. By default it focuses
   * the list's search box beside this group; a drawer over the list passes a way to close itself.
   */
  onSearchInstead?: () => void
}

/**
 * The Where group: Near me, and what's currently in scope. Location comes first because it's the
 * first thing a visitor is deciding, and it's what makes every count below it mean something.
 *
 * There is no town search here: the list's own search box is the one place to type a town, and a
 * second one beside the filters mixed the place in with the other questions (Devindra, 12 Nov).
 */
export function WhereFilter({
  region,
  onPlace,
  onClear,
  searchable = true,
  titled = true,
  counts,
  onSearchInstead,
}: WhereFilterProps) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [searchParams] = useSearchParams()
  const { hasMap } = useWidgetMode()
  const center = parseCenter(searchParams.get('center'))
  const nearMeOn = useNearVisitor(center)
  const { data: regions } = useQuery(regionsQuery())
  const { status, locate, dismiss } = useNearMe({ naming: hasMap, onPlace })
  const searchInstead = useRef(false)

  const regionName = region ? (regions?.find((node) => node.slug === region)?.name ?? region) : null
  const placeName = center && !nearMeOn ? searchParams.get('q') : null
  const scopeLabel = placeName || regionName

  // The calendar's filters have no place to search and, unscoped, nothing in scope to show: a
  // "Where" heading over nothing would read as something failing to load.
  if (!searchable && !scopeLabel) return null

  return (
    <section className="flex flex-col gap-2">
      {titled && (
        <h3 className="text-sm font-semibold text-foreground">{t('filters.where.label')}</h3>
      )}
      {searchable && (
        // Outlined until it's on, so it doesn't outshout the list beside it.
        <Button
          aria-pressed={nearMeOn}
          className={clsx('h-11 self-start', !nearMeOn && 'border-gray-6 text-foreground')}
          color={nearMeOn ? 'primary' : 'neutral'}
          isLoading={status === 'locating'}
          variant={nearMeOn ? 'solid' : 'bordered'}
          onClick={nearMeOn ? onClear : locate}
        >
          {status !== 'locating' && <LocateFixed aria-hidden size={18} />}
          {t('filters.where.near_me')}
        </Button>
      )}
      {scopeLabel && (
        <div>
          {/* The pseudo-element takes the pill's tap area up to 44px without making it look big. */}
          <button
            aria-label={t('filters.chrome.remove', { label: scopeLabel })}
            className="relative inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-gray-3 ps-3 pe-2 text-sm font-medium text-foreground outline-none before:absolute before:inset-x-0 before:-inset-y-1.5 hover:bg-gray-4 focus-visible:ring-2 focus-visible:ring-focus"
            type="button"
            onClick={onClear}
          >
            <span className="truncate">{scopeLabel}</span>
            <X aria-hidden className="shrink-0 text-gray-11" size={16} />
          </button>
        </div>
      )}
      {/* A whole country or region counts what is in it, not what is within 16 miles of its middle,
          and its pill already names it. */}
      {center && counts && placeSize(parseBounds(searchParams.get('bbox'))) !== 'area' && (
        <p className="text-sm text-gray-11">
          {t('filters.where.scope', {
            near: counts.inPerson,
            distance: formatDistance(NEARBY_KM, regionalLocale(locale)),
            online: counts.online,
          })}
        </p>
      )}
      <LocationHelp
        problem={status === 'blocked' || status === 'failed' ? status : null}
        onClose={dismiss}
        onCloseAutoFocus={(event) => {
          if (!searchInstead.current) return
          searchInstead.current = false
          event.preventDefault()
          // This group has no field of its own, so this is the list's search box beside it.
          const root = overlayContainer() ?? document

          root.querySelector<HTMLElement>('[data-vaul-drawer] input, input')?.focus()
        }}
        onSearchInstead={() => {
          searchInstead.current = !onSearchInstead
          dismiss()
          onSearchInstead?.()
        }}
      />
    </section>
  )
}
