import type { TranslationKey } from '@/types/i18next'

import { type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'

import { Button } from '@/components/atoms/Button'
import { Dropdown } from '@/components/atoms/Dropdown'
import { HoverLabel } from '@/components/atoms/HoverLabel'
import {
  DayFilter,
  FormatFilter,
  LanguageFilter,
  MoreFilters,
  RecoveryButton,
  TimeFilter,
} from '@/components/organisms/SearchFilters'
import { useFilterFacets, useFilterScope } from '@/hooks/use-filter-facets'
import { useLocale } from '@/hooks/use-locale'
import { weekdayNames } from '@/lib/time'
import {
  type EventFilters,
  type FilterFacets,
  hasActiveFilters,
  isDateRestricted,
  isOnline,
} from '@/lib/shape'

/** The parts of an answer that are set, as one line: "Tue, Wed · Evening". */
const summarize = (parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' · ')

type Menu = 'where' | 'when' | 'language'

// How many answers a button names before it counts them instead.
const MAX_NAMED = 2

export type FilterChipsWhere = {
  /** The place in scope, as the button names it: its first part, or Near me. */
  place?: string | null
  /** A searched place or Near me is an answer; a place page names its place without being one. */
  placeAnswered: boolean
  /** The place half of the menu, which needs the router and the geocoder; format follows it. */
  menu: (facets: FilterFacets | undefined) => ReactNode
  /** Shown even where the place half has nothing to offer, as where Near me is. */
  always: boolean
}

export type FilterChipsProps = {
  value: EventFilters
  onChange: (next: EventFilters) => void
  /** Clear leads the row once anything is answered. */
  onClear: () => void
  /** The Where button, supplied by the view. Absent, there is none. */
  where?: FilterChipsWhere
  /**
   * `map`: a row across the top right of the map, between the side panel and the map's controls.
   * `inline`: a row in a header, such as the calendar's.
   */
  placement: 'map' | 'inline'
}

/**
 * One button's menu. It mounts only while open, so the live counts are taken only while someone is
 * choosing; the closed buttons need none. With nothing left, it ends on the one change that brings
 * the most classes back.
 */
function ChipMenu({
  menu,
  value,
  onChange,
  where,
}: {
  menu: Menu
  value: EventFilters
  onChange: (next: EventFilters) => void
  where?: FilterChipsWhere
}) {
  const { t } = useLocale()
  const facets = useFilterFacets(value)
  const block = {
    value,
    facets,
    patch: (next: Partial<EventFilters>) => onChange({ ...value, ...next }),
  }

  return (
    <>
      {menu === 'where' && (
        <>
          {where?.menu(facets)}
          <FormatFilter {...block} />
        </>
      )}
      {menu === 'when' && (
        <>
          <DayFilter {...block} />
          <TimeFilter {...block} />
          <MoreFilters {...block} />
        </>
      )}
      {menu === 'language' && <LanguageFilter {...block} layout="menu" />}
      {facets?.counts.total === 0 && (
        <div className="flex flex-col gap-2 border-t border-divider pt-3">
          <p className="text-sm text-foreground" role="status">
            {t('filters.chrome.no_match')}
          </p>
          {facets.recovery && (
            <RecoveryButton
              className="h-auto min-h-11 w-full py-2 whitespace-normal"
              filters={value}
              recovery={facets.recovery}
              onApply={onChange}
            />
          )}
        </div>
      )}
    </>
  )
}

/**
 * One filter button and its menu, which opens under the button's end edge so it stays on the
 * map's side, clear of the list. A screen reader hears the question before the answer.
 */
function FilterChip({
  label,
  summary,
  filled = summary !== '',
  children,
}: {
  label: string
  summary: string
  filled?: boolean
  children: ReactNode
}) {
  return (
    <Dropdown
      fitHeight
      align="end"
      aria-label={label}
      role="dialog"
      trigger={(props) => (
        <Button
          {...props}
          className="pointer-events-auto max-w-56 pe-3"
          color={filled ? 'primary' : 'neutral'}
          radius="full"
          variant="floating"
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
        </Button>
      )}
    >
      <div className="flex min-h-0 w-[320px] flex-col gap-5 overflow-y-auto rounded-lg bg-background p-4 text-foreground">
        {children}
      </div>
    </Dropdown>
  )
}

/**
 * The filters on a computer: Where, When and Language, each a button whose menu asks the phone's
 * own questions (`shownGroups`) from the same blocks. Fully controlled: every tap reports the next
 * answers at once. A button with an answer is filled and names it ("Tue · Evening").
 */
export function FilterChips({ value, onChange, onClear, where, placement }: FilterChipsProps) {
  const { t, formatLocale, languageLabel } = useLocale()
  const scope = useFilterScope(value)
  const weekdays = weekdayNames(formatLocale, 'short')
  const menu = { value, onChange, where }

  const whereSummary = summarize([
    where?.place,
    value.format !== 'any' && t(`filters.format.${value.format}`),
  ])
  const whenParts = [
    ...value.daysOfWeek.map((day) => weekdays[day - 1]),
    ...value.timeOfDay.map((period) => t(`filters.time.${period}`)),
    value.cadence !== 'any' &&
      t(`filters.cadence.${value.cadence.toLowerCase()}` as TranslationKey),
    isDateRestricted(value.dateRange) && t('filters.dates.label'),
  ].filter(Boolean)
  // Past two answers a button names how many, not which: a list would not fit it.
  const whenSummary =
    whenParts.length > MAX_NAMED
      ? t('filters.when.count', { count: whenParts.length })
      : summarize([
          value.daysOfWeek.map((day) => weekdays[day - 1]).join(', '),
          value.timeOfDay.map((period) => t(`filters.time.${period}`)).join(', '),
          value.cadence !== 'any' &&
            t(`filters.cadence.${value.cadence.toLowerCase()}` as TranslationKey),
          isDateRestricted(value.dateRange) && t('filters.dates.label'),
        ])
  // What the closed buttons need of the scope, judged without counting it (`shownGroups` asks the
  // same of the counts inside each menu).
  const hasLanguages =
    value.languages.length > 0 || Boolean(scope?.some((event) => event.languages?.length))
  const mixesFormats =
    value.format !== 'any' ||
    Boolean(scope?.some(isOnline) && scope.some((event) => !isOnline(event)))

  return (
    <div
      aria-label={t('filters.chrome.title')}
      // Over the map the row spans the map between the panel and the map's control column, so it
      // lets every press through but its buttons' own. Physical sides, as the panel and the column
      // have. ⚠ The 352px is the panel's (`DRAWER_W_PX`); the 64px clears the control column's
      // 40px buttons and its 16px inset (`MapControls`). Rendered into the map's element, under
      // that column's corner (z-20), so the column's hover labels draw over the row; `font-sans`
      // undoes the map element's own Helvetica.
      className={clsx(
        'pointer-events-none flex flex-wrap items-center justify-end gap-2',
        placement === 'map'
          ? 'fixed top-4 right-[64px] left-[calc(var(--sy-drawer-w,352px)+32px)] z-[15] font-sans'
          : 'ms-auto',
      )}
      role="group"
    >
      {/* First in a row that ends on the right, so its arrival moves nothing already there: a
          button whose menu is open must not slide out from under the pointer. */}
      {hasActiveFilters({ ...value, region: null }) && (
        <HoverLabel text={t('filters.chrome.clear_one')}>
          <Button
            isIconOnly
            aria-label={t('filters.chrome.clear_one')}
            className="pointer-events-auto"
            color="neutral"
            radius="full"
            variant="floating"
            onClick={onClear}
          >
            <X aria-hidden size={18} />
          </Button>
        </HoverLabel>
      )}
      {where && (where.always || mixesFormats || value.region) && (
        <FilterChip
          filled={where.placeAnswered || value.format !== 'any'}
          label={t('filters.where.label')}
          summary={whereSummary}
        >
          <ChipMenu {...menu} menu="where" />
        </FilterChip>
      )}
      <FilterChip label={t('filters.when.label')} summary={whenSummary}>
        <ChipMenu {...menu} menu="when" />
      </FilterChip>
      {hasLanguages && (
        <FilterChip
          label={t('filters.language.label')}
          summary={
            value.languages.length > MAX_NAMED
              ? t('filters.language.count', { count: value.languages.length })
              : value.languages.map(languageLabel).join(', ')
          }
        >
          <ChipMenu {...menu} menu="language" />
        </FilterChip>
      )}
    </div>
  )
}
