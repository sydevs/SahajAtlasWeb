import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { LocateFixed, X } from 'lucide-react'
import clsx from 'clsx'

import { Button } from '@/components/atoms/Button'
import { LocationHelp } from '@/components/molecules/LocationHelp'
import api, { regionsQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useNearMeState } from '@/config/store'
import { useNearMe } from '@/hooks/use-near-me'
import { overlayContainer } from '@/lib/overlay'
import { NEARBY_KM, type PlaceSearch, parseCenter } from '@/lib/shape'
import { SearchField } from '@/views/shared'

export type WhereFilterProps = {
  /** The region slug in scope, if any. */
  region: string | null
  /** Search a place. Replaces any region in scope. */
  onPlace: (place: PlaceSearch) => void
  /** Back to everywhere: drops the place and the region. */
  onClear: () => void
  /** The town search and Near me only make sense where the results rank by place. */
  searchable?: boolean
  /** Nothing is chosen yet, so choosing a place is the one obvious next step. */
  prominent?: boolean
  /** Off where another search box is already on screen: one place to type a place in. */
  townSearch?: boolean
  /** What a place's scope really holds, so "near" can't suggest more locality than it has. */
  counts?: { inPerson: number; online: number }
}

/**
 * The Where group: Near me, the same town search as the header, and what's currently in scope.
 * Location comes first because it's the first thing a visitor is deciding, and it's what makes
 * every count below it mean something.
 */
export function WhereFilter({
  region,
  onPlace,
  onClear,
  searchable = true,
  prominent = false,
  townSearch = true,
  counts,
}: WhereFilterProps) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const { hasMap } = useWidgetMode()
  const nearCenter = useNearMeState((s) => s.center)
  const center = parseCenter(searchParams.get('center'))
  const centerKey = center?.join(',') ?? ''
  const nearMeOn = Boolean(center && nearCenter && centerKey === nearCenter.join(','))
  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })
  const { data: regions } = useQuery(regionsQuery())
  const { status, locate, dismiss } = useNearMe({ geojson, naming: hasMap, onPlace })
  const section = useRef<HTMLElement>(null)
  const searchInstead = useRef(false)

  const regionName = region ? (regions?.find((node) => node.slug === region)?.name ?? region) : null
  const placeName = center && !nearMeOn ? searchParams.get('q') : null
  const scopeLabel = placeName || regionName

  return (
    <section ref={section} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{t('filters.where.label')}</h3>
      {searchable && (
        // Px, not `h-11`: the geocoder redefines `--spacing` inside itself, so a spacing-scale
        // height resolves against its value and comes out three times too tall. 42 plus the
        // field's 1px border is the button's 44, and `field-size` is the input's own type size.
        <div
          className={clsx(
            'flex gap-2 [&_input]:h-[42px]',
            prominent || !townSearch ? 'flex-col' : 'items-start',
          )}
        >
          <Button
            aria-pressed={nearMeOn}
            className={clsx(
              'field-size h-[44px] shrink-0',
              !nearMeOn && !prominent && 'border-gray-6 text-foreground',
            )}
            color={nearMeOn || prominent ? 'primary' : 'neutral'}
            isLoading={status === 'locating'}
            variant={nearMeOn || prominent ? 'solid' : 'bordered'}
            onClick={nearMeOn ? onClear : locate}
          >
            {status !== 'locating' && <LocateFixed aria-hidden size={18} />}
            {t('filters.where.near_me')}
          </Button>
          {/* Keyed on the place, so a pick empties the field: the pick shows as the chip below. */}
          {townSearch && (
            <SearchField
              key={centerKey}
              label={t('filters.where.placeholder')}
              seedFromUrl={false}
              syncToUrl={false}
              onPlace={onPlace}
            />
          )}
        </div>
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
      {center && counts && (
        <p className="text-sm text-gray-11">
          {t('filters.where.scope', {
            near: counts.inPerson,
            km: NEARBY_KM,
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
          // The panel has no field of its own, so this can be the list's search box beside it.
          const root =
            section.current?.closest('[data-vaul-drawer]') ?? overlayContainer() ?? document

          root.querySelector<HTMLElement>('[data-vaul-drawer] input, input')?.focus()
        }}
        onSearchInstead={() => {
          searchInstead.current = true
          dismiss()
        }}
      />
    </section>
  )
}
