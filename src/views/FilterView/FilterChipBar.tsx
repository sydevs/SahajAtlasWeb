import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info } from 'luxon'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'

import { usePanelFilters } from './use-panel-filters'
import { WhereFilter } from './WhereFilter'

import { Dropdown } from '@/components/atoms/Dropdown'
import {
  DayFilter,
  FormatFilter,
  LanguageFilter,
  TimeFilter,
} from '@/components/molecules/SearchFilters'
import { regionsQuery } from '@/config/api'
import { useLocale } from '@/hooks/use-locale'

/** One chip and its dropdown. An active chip names what's selected. */
function FilterChip({
  label,
  summary,
  children,
  footer,
}: {
  label: string
  summary?: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <Dropdown
      aria-label={label}
      role="dialog"
      trigger={
        <span
          className={clsx(
            'flex h-10 max-w-48 items-center gap-1.5 rounded-full border ps-4 pe-3 text-sm font-medium shadow-md transition-colors',
            summary
              ? 'border-primary-9 bg-primary-9 text-primary-foreground'
              : 'border-divider bg-background text-foreground hover:bg-gray-3',
          )}
        >
          <span className="truncate">{summary ?? label}</span>
          <ChevronDown aria-hidden className="shrink-0 opacity-70" size={16} />
        </span>
      }
    >
      <div className="flex w-[320px] flex-col gap-3 rounded-lg bg-background p-4 text-foreground">
        {children}
        {footer}
      </div>
    </Dropdown>
  )
}

/**
 * The filters as a slim row of dropdown chips over the map: the alternative to `FiltersPanel`,
 * which keeps almost all of the map on view at the cost of one more tap per question.
 */
export function FilterChipBar() {
  const { t } = useTranslation()
  const { locale, languageLabel } = useLocale()
  const { filters, facets, write, count, canClear, clear, pickPlace, clearWhere } =
    usePanelFilters()
  const control = {
    value: filters,
    facets,
    patch: (next: Partial<typeof filters>) => write({ ...filters, ...next }),
  }
  const relevance = facets?.relevance
  const [searchParams] = useSearchParams()
  const { data: regions } = useQuery(regionsQuery())
  // A place's name is an address, so its first part is what fits on a chip.
  const whereSummary =
    searchParams.get('q')?.split(',')[0] ||
    regions?.find((node) => node.slug === filters.region)?.name ||
    undefined
  const weekdays = Info.weekdays('short', { locale })
  const footer = (
    <p aria-live="polite" className="text-sm text-gray-11">
      {count === undefined
        ? null
        : count === 0
          ? t('filters.chrome.no_match')
          : t('filters.chrome.class_count', { count })}
    </p>
  )

  return (
    <div
      aria-label={t('filters.chrome.title')}
      className="pointer-events-auto fixed end-16 top-4 z-30 flex flex-wrap items-center justify-end gap-2 ps-[calc(var(--sy-drawer-w,352px)+96px)]"
      role="group"
    >
      <FilterChip footer={footer} label={t('filters.where.label')} summary={whereSummary}>
        <WhereFilter region={filters.region} onClear={clearWhere} onPlace={pickPlace} />
      </FilterChip>
      {(filters.format !== 'any' || (relevance?.format ?? true)) && (
        <FilterChip
          footer={footer}
          label={t('filters.format.question')}
          summary={filters.format === 'any' ? undefined : t(`filters.format.${filters.format}`)}
        >
          <FormatFilter {...control} />
        </FilterChip>
      )}
      {(filters.daysOfWeek.length > 0 || (relevance?.days ?? true)) && (
        <FilterChip
          footer={footer}
          label={t('filters.days.short_label')}
          summary={filters.daysOfWeek.map((day) => weekdays[day - 1]).join(', ') || undefined}
        >
          <DayFilter {...control} />
        </FilterChip>
      )}
      {(filters.timeOfDay.length > 0 || (relevance?.time ?? true)) && (
        <FilterChip
          footer={footer}
          label={t('filters.time.label')}
          summary={
            filters.timeOfDay.map((period) => t(`filters.time.${period}`)).join(', ') || undefined
          }
        >
          <TimeFilter {...control} />
        </FilterChip>
      )}
      {(filters.languages.length > 0 || relevance?.languages) && (
        <FilterChip
          footer={footer}
          label={t('filters.language.label')}
          summary={filters.languages.map(languageLabel).join(', ') || undefined}
        >
          <LanguageFilter {...control} />
        </FilterChip>
      )}
      {canClear && (
        <button
          className="flex h-10 items-center gap-1 rounded-full border border-divider bg-background ps-3 pe-3 text-sm font-medium text-foreground shadow-md hover:bg-gray-3"
          type="button"
          onClick={clear}
        >
          <X aria-hidden size={16} />
          {t('filters.chrome.clear_one')}
        </button>
      )}
    </div>
  )
}
