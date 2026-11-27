import type { TranslationKey } from '@/types/i18next'

import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router'
import { ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'

import { RecoveryButton } from './RecoveryButton'
import { usePanelFilters } from './use-panel-filters'
import { WhereFilter } from './WhereFilter'

import { Button } from '@/components/atoms/Button'
import { Dropdown } from '@/components/atoms/Dropdown'
import {
  DayFilter,
  FormatFilter,
  LanguageFilter,
  MoreFilters,
  TimeFilter,
} from '@/components/organisms/SearchFilters'
import { regionsQuery } from '@/config/api'
import { useSearchFocus } from '@/config/store'
import { useFilterFacets, useFilterScope } from '@/hooks/use-filter-facets'
import { useLocale } from '@/hooks/use-locale'
import { useNearVisitor } from '@/hooks/use-near-me'
import { weekdayNames } from '@/lib/time'
import {
  type EventFilters,
  type PlaceSearch,
  isDateRestricted,
  isOnline,
  parseCenter,
  searchedPlaceName,
} from '@/lib/shape'

/** The parts of an answer that are set, as one line: "Tue, Wed · Evening". */
const summarize = (parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' · ')

// Focuses the list's search box beside the buttons, and leaves no request behind where none is
// on screen to take it.
const focusSearch = () => {
  const { request, consume } = useSearchFocus.getState()

  request()
  consume()
}

type ChipMenuProps = {
  menu: 'where' | 'when' | 'language'
  filters: EventFilters
  write: (next: EventFilters) => void
  searchable: boolean
  onPlace: (place: PlaceSearch) => void
  onClearWhere: () => void
}

/**
 * One button's menu. It mounts only while open, so the live counts are taken only while someone
 * is choosing; the closed buttons need none. With nothing left, it ends on the one change that
 * brings the most classes back.
 */
function ChipMenu({ menu, filters, write, searchable, onPlace, onClearWhere }: ChipMenuProps) {
  const { t } = useLocale()
  const facets = useFilterFacets(filters)
  const block = {
    value: filters,
    facets,
    patch: (next: Partial<EventFilters>) => write({ ...filters, ...next }),
  }

  return (
    <>
      {menu === 'where' && (
        <>
          <WhereFilter
            counts={facets?.counts.format}
            region={filters.region}
            searchable={searchable}
            onClear={onClearWhere}
            onPlace={onPlace}
            onSearchInstead={focusSearch}
          />
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
      {menu === 'language' && <LanguageFilter {...block} layout="list" />}
      {facets?.counts.total === 0 && (
        <div className="flex flex-col gap-2 border-t border-divider pt-3">
          <p className="text-sm text-foreground" role="status">
            {t('filters.chrome.no_match')}
          </p>
          {facets.recovery && (
            <RecoveryButton
              className="h-auto min-h-11 w-full py-2 whitespace-normal"
              filters={filters}
              recovery={facets.recovery}
              onApply={write}
            />
          )}
        </div>
      )}
    </>
  )
}

type FilterChipProps = {
  label: string
  /** The answer, which the button names in place of the question. */
  summary: string
  /** Shown filled. By default, whenever there is an answer. */
  filled?: boolean
  children: ReactNode
}

/**
 * One filter button and its menu, which opens under the button's end edge so it stays on the
 * map's side, clear of the list. A screen reader hears the question before the answer.
 */
function FilterChip({ label, summary, filled = summary !== '', children }: FilterChipProps) {
  return (
    <Dropdown
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
      <div className="flex max-h-[calc(var(--sy-frame-h,100dvh)-96px)] w-[320px] flex-col gap-5 overflow-y-auto rounded-lg bg-background p-4 text-foreground">
        {children}
      </div>
    </Dropdown>
  )
}

export type FilterChipBarProps = {
  /**
   * `map`: a row across the top right of the map, between the side panel and the map's controls.
   * `inline`: a row in a header, such as the calendar's.
   */
  placement: 'map' | 'inline'
}

/**
 * The filters on a computer: Where, When and Language, each a button whose menu asks the phone's
 * own questions (`shownGroups`), from the same blocks, and applies each tap at once
 * (`usePanelFilters`).
 */
export function FilterChipBar({ placement }: FilterChipBarProps) {
  const { t, formatLocale, languageLabel } = useLocale()
  const { filters, write, canClear, clear, pickPlace, clearWhere } = usePanelFilters()
  const scope = useFilterScope(filters)
  const [searchParams] = useSearchParams()
  const center = parseCenter(searchParams.get('center'))
  const nearMe = useNearVisitor(center)
  const { data: regions } = useQuery(regionsQuery())
  // The calendar does not rank by place, so it has no Near me, and its Where is only a scope.
  const searchable = useLocation().pathname !== '/calendar'
  const weekdays = weekdayNames(formatLocale, 'short')
  const menu = { filters, write, searchable, onPlace: pickPlace, onClearWhere: clearWhere }

  // A searched place's first part is what fits on a button.
  const placeName = center
    ? nearMe
      ? t('filters.where.near_me')
      : searchedPlaceName(searchParams.get('q'))
    : regions?.find((node) => node.slug === filters.region)?.name
  const formatName = filters.format !== 'any' && t(`filters.format.${filters.format}`)
  const whenSummary = summarize([
    filters.daysOfWeek.map((day) => weekdays[day - 1]).join(', '),
    filters.timeOfDay.map((period) => t(`filters.time.${period}`)).join(', '),
    filters.cadence !== 'any' &&
      t(`filters.cadence.${filters.cadence.toLowerCase()}` as TranslationKey),
    isDateRestricted(filters.dateRange) && t('filters.dates.label'),
  ])
  // What the closed buttons need of the scope, judged without counting it (`shownGroups` asks the
  // same of the counts inside each menu).
  const hasLanguages =
    filters.languages.length > 0 || Boolean(scope?.some((event) => event.languages?.length))
  const mixesFormats =
    filters.format !== 'any' ||
    Boolean(scope?.some(isOnline) && scope.some((event) => !isOnline(event)))

  return (
    <div
      aria-label={t('filters.chrome.title')}
      // Over the map the row spans the map between the panel and the map's control column, so it
      // lets every press through but its buttons' own. Physical sides, as the panel and the column
      // have. ⚠ The 352px is the panel's (`DRAWER_W_PX`); the 100px clears the column's buttons
      // and the credits beside them (`MapControls`).
      className={clsx(
        'pointer-events-none flex flex-wrap items-center justify-end gap-2',
        placement === 'map'
          ? 'fixed top-4 right-[100px] left-[calc(var(--sy-drawer-w,352px)+32px)] z-30'
          : 'ms-auto',
      )}
      role="group"
    >
      {/* First in a row that ends on the right, so its arrival moves nothing already there: a
          button whose menu is open must not slide out from under the pointer. */}
      {canClear && (
        <Button
          className="pointer-events-auto"
          color="neutral"
          radius="full"
          variant="floating"
          onClick={clear}
        >
          <X aria-hidden size={16} />
          {t('filters.chrome.clear_one')}
        </Button>
      )}
      {(searchable || mixesFormats || filters.region) && (
        <FilterChip
          // A place page names its place without counting it as an answer.
          filled={Boolean(center) || filters.format !== 'any'}
          label={t('filters.where.label')}
          summary={summarize([placeName, formatName])}
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
          summary={filters.languages.map(languageLabel).join(', ')}
        >
          <ChipMenu {...menu} menu="language" />
        </FilterChip>
      )}
    </div>
  )
}
