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

type Placement = 'map' | 'toolbar'

// Over the map a button floats; in a toolbar it sits with the toolbar's own controls, smaller and
// unlifted. Filled, it takes the primary fill either way.
const trigger = (placement: Placement, filled: boolean) =>
  placement === 'map'
    ? ({ variant: 'floating', size: 'md', color: filled ? 'primary' : 'neutral' } as const)
    : ({
        variant: filled ? 'solid' : 'bordered',
        size: 'sm',
        color: filled ? 'primary' : 'neutral',
      } as const)

// How many answers a button names before it counts them instead.
const MAX_NAMED = 2

export type FilterMenusWhere = {
  /** The place in scope, as the button names it: its first part, or Near me. */
  place?: string | null
  /** A searched place or Near me is an answer; a place page names its place without being one. */
  placeAnswered: boolean
  /** The place half of the menu, which needs the router and the geocoder; format follows it. */
  menu: (facets: FilterFacets | undefined) => ReactNode
  /** Shown even where the place half has nothing to offer, as where Near me is. */
  always: boolean
}

export type FilterMenusProps = {
  value: EventFilters
  onChange: (next: EventFilters) => void
  /** Clear leads the row once anything is answered. */
  onClear: () => void
  /** The Where button, supplied by the view. Absent, there is none. */
  where?: FilterMenusWhere
  /**
   * `map`: floating buttons beside the map's own controls, in Mapbox's control corner.
   * `toolbar`: smaller bordered buttons inline in a view's toolbar, such as the calendar's.
   */
  placement: Placement
}

/**
 * One button's menu. It mounts only while open, so the live counts are taken only while someone is
 * choosing; the closed buttons need none. With nothing left, it ends on the one change that brings
 * the most classes back.
 */
function MenuBody({
  menu,
  value,
  onChange,
  where,
}: {
  menu: Menu
  value: EventFilters
  onChange: (next: EventFilters) => void
  where?: FilterMenusWhere
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
function FilterMenu({
  label,
  summary,
  filled = summary !== '',
  placement,
  children,
}: {
  label: string
  summary: string
  filled?: boolean
  placement: Placement
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
          {...trigger(placement, filled)}
          className={clsx('max-w-56', placement === 'toolbar' && !filled && 'border-gray-6')}
          radius="full"
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
export function FilterMenus({ value, onChange, onClear, where, placement }: FilterMenusProps) {
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

  // Clear leads a row that ends on the right, in either placement, so its arrival moves nothing
  // already there (a button whose menu is open must not slide out from under the pointer), and in
  // a toolbar it is not read as the view's own close button in the corner.
  const clear = hasActiveFilters({ ...value, region: null }) && (
    <HoverLabel text={t('filters.chrome.clear')}>
      <Button
        isIconOnly
        {...trigger(placement, false)}
        aria-label={t('filters.chrome.clear')}
        className={clsx(placement === 'toolbar' && 'border-gray-6')}
        radius="full"
        onClick={onClear}
      >
        <X aria-hidden size={placement === 'map' ? 18 : 16} />
      </Button>
    </HoverLabel>
  )

  return (
    <div
      aria-label={t('filters.chrome.title')}
      // On the map the row is part of Mapbox's control corner (`MapControls`), which places it.
      // ⚠ Its widest is the map (`100cqw`, the map is the size container) less the side panel
      // (`DRAWER_W_PX`, its 16px inset and a 16px gap) and the column of buttons beside it, so it
      // wraps rather than running under the panel. `font-sans` undoes the map's own Helvetica.
      className={clsx(
        'flex flex-wrap items-center justify-end gap-2',
        placement === 'map'
          ? 'max-w-[calc(100cqw-var(--sy-drawer-w,352px)-96px)] font-sans'
          : 'ms-auto',
      )}
      role="group"
    >
      {clear}
      {where && (where.always || mixesFormats || value.region) && (
        <FilterMenu
          filled={where.placeAnswered || value.format !== 'any'}
          label={t('filters.where.label')}
          placement={placement}
          summary={whereSummary}
        >
          <MenuBody {...menu} menu="where" />
        </FilterMenu>
      )}
      <FilterMenu label={t('filters.when.label')} placement={placement} summary={whenSummary}>
        <MenuBody {...menu} menu="when" />
      </FilterMenu>
      {hasLanguages && (
        <FilterMenu
          label={t('filters.language.label')}
          placement={placement}
          summary={
            value.languages.length > MAX_NAMED
              ? t('filters.language.count', { count: value.languages.length })
              : value.languages.map(languageLabel).join(', ')
          }
        >
          <MenuBody {...menu} menu="language" />
        </FilterMenu>
      )}
    </div>
  )
}
