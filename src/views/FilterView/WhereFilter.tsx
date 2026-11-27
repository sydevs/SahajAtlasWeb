import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { LocateFixed } from 'lucide-react'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Chip } from '@/components/atoms/Chip'
import { FormField } from '@/components/molecules/FormField'
import { regionsQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { useSearchFocus } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { useNearMe, useNearVisitor } from '@/hooks/use-near-me'
import { formatDistance } from '@/lib'
import { NEARBY_KM, type PlaceSearch, parseCenter, searchedPlaceName } from '@/lib/shape'
import { useDrawerControl } from '@/views/shared'

export type WhereFilterProps = {
  /** The region slug in scope, if any. */
  region: string | null
  /** Search a place. Replaces any region in scope. */
  onPlace: (place: PlaceSearch) => void
  /** Back to everywhere: drops the place and the region. */
  onClear: () => void
  /** Near me only makes sense where the results rank by place. */
  searchable: boolean
  /** What a searched place's scope holds, so "near" never suggests more locality than it has. */
  counts?: { inPerson: number; online: number }
  /**
   * Where "Search instead", after a failed location, takes the visitor. By default it closes the
   * filters onto the list, whose search box then takes the focus.
   */
  onSearchInstead?: () => void
}

/**
 * The Where group: Near me, and the place in scope as a removable tag. There is no town field:
 * the list's own search box is the one place to type a town.
 */
export function WhereFilter({
  region,
  onPlace,
  onClear,
  searchable,
  counts,
  onSearchInstead,
}: WhereFilterProps) {
  const { t } = useTranslation()
  const { formatLocale } = useLocale()
  const [searchParams] = useSearchParams()
  const { hasMap } = useWidgetMode()
  const { dismiss } = useDrawerControl()
  const center = parseCenter(searchParams.get('center'))
  const nearMeOn = useNearVisitor(center)
  const { data: regions } = useQuery(regionsQuery())
  const { status, locate } = useNearMe({ naming: hasMap, onPlace })
  const requestSearchFocus = useSearchFocus((s) => s.request)

  const regionName = region ? (regions?.find((node) => node.slug === region)?.name ?? region) : null
  const placeName = center && !nearMeOn ? searchedPlaceName(searchParams.get('q')) : null
  const scopeLabel = placeName || regionName

  // The calendar's filters have no place to search and, unscoped, nothing in scope to show: a
  // heading over nothing would read as something failing to load.
  if (!searchable && !scopeLabel) return null

  // Only the top view is rendered, so the list's search box takes the focus once it mounts.
  const searchInstead = () => {
    requestSearchFocus()
    if (onSearchInstead) onSearchInstead()
    else dismiss()
  }

  return (
    <FormField as="fieldset" label={t('filters.where.label')} name="filter-where">
      <div className="flex flex-col gap-2">
        {searchable && (
          <Button
            aria-pressed={nearMeOn}
            className={
              nearMeOn ? 'h-11 self-start' : 'h-11 self-start border-gray-6 text-foreground'
            }
            color={nearMeOn ? 'primary' : 'neutral'}
            isLoading={status === 'locating'}
            variant={nearMeOn ? 'solid' : 'bordered'}
            onClick={nearMeOn ? onClear : locate}
          >
            {status !== 'locating' && <LocateFixed aria-hidden size={18} />}
            {t('filters.where.near_me')}
          </Button>
        )}
        {status === 'failed' && (
          // Announced at once: it answers the press that asked for the location.
          <Alert color="danger" role="alert" size="sm">
            <button
              data-vaul-no-drag
              className="touch-target relative w-full text-start text-sm focus-ring hover:underline"
              type="button"
              onClick={searchInstead}
            >
              {t('common.map.location_failed')}
            </button>
          </Alert>
        )}
        {scopeLabel && (
          // The same removable pill the applied filters show above the list.
          <Chip
            className="self-start"
            closeLabel={t('filters.a11y.remove', { label: scopeLabel })}
            color="neutral"
            radius="full"
            onClose={onClear}
          >
            {scopeLabel}
          </Chip>
        )}
        {/* A whole country or region counts what is in it, and its tag already names it. */}
        {center && counts && (
          <p className="text-sm text-gray-11">
            {t('filters.where.scope', {
              near: counts.inPerson,
              distance: formatDistance(NEARBY_KM, formatLocale),
              online: counts.online,
            })}
          </p>
        )}
      </div>
    </FormField>
  )
}
