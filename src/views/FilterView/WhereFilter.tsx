import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { LocateFixed, X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import api, { regionsQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useNearMeState } from '@/config/store'
import { useNearMe } from '@/hooks/use-near-me'
import { type PlaceSearch, parseCenter } from '@/lib/shape'
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
}

/**
 * The Where group: Near me, the same town search as the header, and what's currently in scope.
 * Location comes first because it's the first thing a visitor is deciding, and it's what makes
 * every count below it mean something.
 */
export function WhereFilter({ region, onPlace, onClear, searchable = true }: WhereFilterProps) {
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
  const { status, locate } = useNearMe({ geojson, naming: hasMap, onPlace })

  const regionName = region ? (regions?.find((node) => node.slug === region)?.name ?? region) : null
  const placeName = center && !nearMeOn ? searchParams.get('q') : null
  const scopeLabel = placeName || regionName

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{t('filters.where.label')}</h3>
      {searchable && (
        // Px, not `h-11`: the geocoder redefines `--spacing` inside itself, so a spacing-scale
        // height resolves against its value and comes out three times too tall.
        <div className="flex items-start gap-2 [&_input]:h-[44px]">
          <Button
            aria-pressed={nearMeOn}
            className={nearMeOn ? 'h-11 shrink-0' : 'h-11 shrink-0 border-gray-6 text-foreground'}
            color={nearMeOn ? 'primary' : 'neutral'}
            isLoading={status === 'locating'}
            variant={nearMeOn ? 'solid' : 'bordered'}
            onClick={nearMeOn ? onClear : locate}
          >
            {status !== 'locating' && <LocateFixed aria-hidden size={18} />}
            {t('filters.where.near_me')}
          </Button>
          {/* Keyed on the place, so a pick empties the field: the pick shows as the chip below. */}
          <SearchField
            key={centerKey}
            label={t('filters.where.placeholder')}
            seedFromUrl={false}
            syncToUrl={false}
            onPlace={onPlace}
          />
        </div>
      )}
      {status === 'failed' && (
        <p className="text-sm text-gray-11" role="status">
          {t('common.map.location_failed')}
        </p>
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
    </section>
  )
}
