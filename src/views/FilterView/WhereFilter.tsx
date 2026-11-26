import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { LocateFixed, X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { FormField } from '@/components/molecules/FormField'
import { regionsQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { useNearMe, useNearVisitor } from '@/hooks/use-near-me'
import { type PlaceSearch, parseCenter } from '@/lib/shape'
import { useDrawerControl } from '@/views/shared'

export type WhereFilterProps = {
  /** The region slug in scope, if any. */
  region: string | null
  /** Search a place. Replaces any region in scope. */
  onPlace: (place: PlaceSearch) => void
  /** Back to everywhere: drops the place and the region. */
  onClear: () => void
  /** Near me only makes sense where the results rank by place. */
  searchable?: boolean
}

/**
 * The Where group: Near me, and the place in scope as a removable tag. There is no town field:
 * the list's own search box is the one place to type a town.
 */
export function WhereFilter({ region, onPlace, onClear, searchable = true }: WhereFilterProps) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const { hasMap } = useWidgetMode()
  const { dismiss } = useDrawerControl()
  const center = parseCenter(searchParams.get('center'))
  const nearMeOn = useNearVisitor(center)
  const { data: regions } = useQuery(regionsQuery())
  const { status, locate } = useNearMe({ naming: hasMap, onPlace })
  const section = useRef<HTMLDivElement>(null)

  const regionName = region ? (regions?.find((node) => node.slug === region)?.name ?? region) : null
  const placeName = center && !nearMeOn ? searchParams.get('q') : null
  const scopeLabel = placeName || regionName

  // The calendar's filters have no place to search and, unscoped, nothing in scope to show: a
  // heading over nothing would read as something failing to load.
  if (!searchable && !scopeLabel) return null

  // Only the top view is rendered, so the list's search box appears once the drawer has closed.
  // It is looked for in the widget's own root until it does, and focused then.
  const searchInstead = () => {
    const root = section.current?.getRootNode() as Document | ShadowRoot | undefined
    let tries = 0

    dismiss()

    const focusField = () => {
      const field = root?.querySelector<HTMLInputElement>('[role="search"] input')

      if (field) return field.focus()
      if (++tries < 20) setTimeout(focusField, 50)
    }

    setTimeout(focusField, 50)
  }

  return (
    <FormField as="fieldset" label={t('filters.where.label')} name="filter-where">
      <div ref={section} className="flex flex-col gap-2">
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
        {/* `contents`, so the live region takes no gap in the column while it is empty. */}
        <div className="contents" role="status">
          {status === 'failed' && (
            <button
              className="touch-target relative self-start text-start text-sm text-primary-11 focus-ring hover:underline"
              type="button"
              onClick={searchInstead}
            >
              {t('common.map.location_failed')}
            </button>
          )}
        </div>
        {scopeLabel && (
          <div>
            <button
              aria-label={t('filters.a11y.remove', { label: scopeLabel })}
              className="touch-target relative inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-gray-3 ps-3 pe-2 text-sm font-medium text-foreground focus-ring hover:bg-gray-4"
              type="button"
              onClick={onClear}
            >
              <span className="truncate">{scopeLabel}</span>
              <X aria-hidden className="shrink-0 text-gray-11" size={16} />
            </button>
          </div>
        )}
      </div>
    </FormField>
  )
}
