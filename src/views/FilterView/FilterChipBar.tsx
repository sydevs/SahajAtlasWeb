import type { TranslationKey } from '@/types/i18next'

import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'

import { RecoveryButton } from './RecoveryButton'
import { usePanelFilters } from './use-panel-filters'
import { WhereFilter } from './WhereFilter'

import { Dropdown } from '@/components/atoms/Dropdown'
import {
  DayFilter,
  FilterGroup,
  FormatFilter,
  LanguageFilter,
  MoreFilters,
  TimeFilter,
} from '@/components/molecules/SearchFilters'
import { regionsQuery } from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { useNearVisitor } from '@/hooks/use-near-me'
import { isDateRestricted, parseCenter, shownGroups } from '@/lib/shape'
import { weekdayNames } from '@/lib/time'

/** The parts of a chip's summary that are set, as one line: "Tue, Wed · Evening". */
const summarize = (parts: (string | false | null | undefined)[]): string | undefined =>
  parts.filter(Boolean).join(' · ') || undefined

/**
 * One chip and its popover. A chip with a summary names it in place of the question; its
 * screen-reader name still starts with the question, so "Tue · Evening" is heard as "When: Tue ·
 * Evening". It fills only when the visitor chose something (`active`, by default whenever there is
 * a summary): the Where chip names the place in scope without having been asked.
 *
 * The popover opens under the chip's end edge, so it stays on the map's right side, clear of the
 * list (Devindra, 12 Nov). Inside it the gutter is the popover's own 16px padding, so a full-width
 * row (More filters) bleeds to its edges as it does to a drawer's.
 */
function FilterChip({
  label,
  summary,
  active = Boolean(summary),
  children,
  footer,
}: {
  label: string
  summary?: string
  active?: boolean
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <Dropdown
      align="end"
      aria-label={label}
      className="pointer-events-auto"
      role="dialog"
      trigger={
        <span
          className={clsx(
            'flex h-10 max-w-56 items-center gap-1.5 rounded-full border ps-4 pe-3 text-sm font-medium shadow-md transition-colors',
            active
              ? 'border-primary-9 bg-primary-9 text-primary-foreground'
              : 'border-divider bg-background text-foreground hover:bg-gray-3',
          )}
        >
          <span className="truncate">
            {summary ? (
              <>
                <span className="sr-only">{label}: </span>
                {summary}
              </>
            ) : (
              label
            )}
          </span>
          <ChevronDown aria-hidden className="shrink-0 opacity-70" size={16} />
        </span>
      }
    >
      <div className="flex max-h-[calc(var(--sy-frame-h,100dvh)-96px)] w-[320px] flex-col gap-5 overflow-y-auto rounded-lg bg-background p-4 text-foreground [--spacing-gutter:16px]">
        {children}
        {footer}
      </div>
    </Dropdown>
  )
}

/**
 * The filters on a computer: three chips along the top of the map, Where, When and Language, each
 * opening a small popover (Devindra, 12 Nov). Nothing is open until a chip is pressed, and the map
 * keeps its full width. Every tap applies at once, as on the phone, and the chips ask the same
 * questions the phone's filters do (`shownGroups`).
 *
 * - **Where** is the place (Near me, the place in scope) and online or in person.
 * - **When** is the day and the time of day, with frequency and dates folded under More filters.
 * - **Language** lists the languages this place's classes are held in.
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
  const shown = shownGroups(filters, facets)
  const [searchParams] = useSearchParams()
  const nearVisitor = useNearVisitor(parseCenter(searchParams.get('center')))
  const { data: regions } = useQuery(regionsQuery())
  const weekdays = weekdayNames(locale, 'short')

  // A place's name is an address, so its first part is what fits on a chip.
  const placeLabel = nearVisitor
    ? t('filters.where.near_me')
    : searchParams.get('q')?.split(',')[0] ||
      regions?.find((node) => node.slug === filters.region)?.name
  const whereSummary = summarize([
    placeLabel,
    filters.format !== 'any' && t(`filters.format.${filters.format}`),
  ])
  // The place in scope is where the visitor is browsing, not a filter they set: a place page names
  // it unfilled, and only a searched place, Near me or a format fills the chip, as an answered When
  // or Language does.
  const whereChosen = nearVisitor || Boolean(searchParams.get('q')) || filters.format !== 'any'
  const whenSummary = summarize([
    filters.daysOfWeek.map((day) => weekdays[day - 1]).join(', '),
    filters.timeOfDay.map((period) => t(`filters.time.${period}`)).join(', '),
    filters.cadence !== 'any' &&
      t(`filters.cadence.${filters.cadence.toLowerCase()}` as TranslationKey),
    isDateRestricted(filters.dateRange) && t('filters.dates.label'),
  ])
  const languageSummary = summarize([filters.languages.map(languageLabel).join(', ')])

  // Each popover ends on the live count, and with nothing left, on the one change that helps most.
  const footer = (
    <div className="-mx-4 -mb-4 flex flex-col gap-2 border-t border-divider px-4 py-3">
      <p aria-live="polite" className="text-sm text-gray-11">
        {count === undefined
          ? null
          : count === 0
            ? t('filters.chrome.no_match')
            : t('filters.chrome.class_count', { count })}
      </p>
      {count === 0 && facets?.recovery && (
        <RecoveryButton
          className="h-auto min-h-11 w-full py-2 whitespace-normal"
          filters={filters}
          recovery={facets.recovery}
          onApply={write}
        />
      )}
    </div>
  )

  // The row spans the map between the panel and the control column, so the map keeps every press
  // but the chips' own. Physical sides, as the panel and the control column have.
  return (
    <div
      aria-label={t('filters.chrome.title')}
      className="pointer-events-none fixed top-4 right-16 left-[calc(var(--sy-drawer-w,352px)+88px)] z-30 flex flex-wrap items-center justify-end gap-1.5"
      role="group"
    >
      {/* First in a right-aligned row, so its arrival moves nothing that's already there: a chip
          whose popover is open must not slide away from under the pointer. */}
      {canClear && (
        <button
          className="pointer-events-auto flex h-10 items-center gap-1 rounded-full border border-divider bg-background ps-3 pe-3 text-sm font-medium text-foreground shadow-md hover:bg-gray-3"
          type="button"
          onClick={clear}
        >
          <X aria-hidden size={16} />
          {t('filters.chrome.clear_one')}
        </button>
      )}
      <FilterChip
        active={whereChosen}
        footer={footer}
        label={t('filters.where.label')}
        summary={whereSummary}
      >
        <WhereFilter
          counts={
            facets && {
              inPerson: facets.counts.format.offline,
              online: facets.counts.format.online,
            }
          }
          region={filters.region}
          titled={false}
          onClear={clearWhere}
          onPlace={pickPlace}
        />
        {shown.format && (
          <FilterGroup label={t('filters.format.question')}>
            <FormatFilter {...control} />
          </FilterGroup>
        )}
      </FilterChip>
      <FilterChip footer={footer} label={t('filters.when.label')} summary={whenSummary}>
        {shown.days && (
          <FilterGroup label={t('filters.days.short_label')}>
            <DayFilter {...control} />
          </FilterGroup>
        )}
        {shown.time && (
          <FilterGroup label={t('filters.time.label')}>
            <TimeFilter {...control} />
          </FilterGroup>
        )}
        <MoreFilters {...control} />
      </FilterChip>
      {shown.languages && (
        <FilterChip footer={footer} label={t('filters.language.label')} summary={languageSummary}>
          <LanguageFilter {...control} className="-m-1" layout="list" />
        </FilterChip>
      )}
    </div>
  )
}
