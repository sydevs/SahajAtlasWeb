import type { TranslationKey } from '@/types/i18next'

import { type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
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
import { DRAWER_W_PX } from '@/config/responsive'
import { useLocale } from '@/hooks/use-locale'
import { useNearVisitor } from '@/hooks/use-near-me'
import { weekdayNames } from '@/lib/time'
import {
  type EventFilters,
  isDateRestricted,
  parseCenter,
  searchedPlaceName,
  shownGroups,
} from '@/lib/shape'

// The map's control column: its 16px inset, its 40px buttons, and the compact credits button that
// sits level with their top, to their left.
const CONTROLS_CLEARANCE_PX = 16 + 40 + 8 + 24 + 12
// The side panel floats 16px in from the left, and the row keeps that much again from it.
const PANEL_CLEARANCE_PX = DRAWER_W_PX + 16 + 16

/** The parts of an answer that are set, as one line: "Tue, Wed · Evening". */
const summarize = (parts: (string | false | null | undefined)[]): string | undefined =>
  parts.filter(Boolean).join(' · ') || undefined

type FilterChipProps = {
  label: string
  /** The answer, which the button names in place of the question. */
  summary?: string
  /** Shown filled. Where can name its place without counting as answered. */
  filled: boolean
  children: ReactNode
}

/**
 * One filter button and its menu, which opens under the button's end edge so it stays on the
 * map's side, clear of the list. A screen reader hears the question before the answer.
 */
function FilterChip({ label, summary, filled, children }: FilterChipProps) {
  return (
    <Dropdown
      align="end"
      aria-label={label}
      role="dialog"
      trigger={({ ref, ...props }) => (
        <Button
          {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
          ref={ref as Ref<HTMLButtonElement>}
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
      {/* The gutter is the menu's own 16px, so More filters bleeds to its edges as in a drawer. */}
      <div className="flex max-h-[calc(var(--sy-frame-h,100dvh)-96px)] w-[320px] max-w-[calc(100vw-32px)] flex-col gap-5 overflow-y-auto rounded-lg bg-background p-4 text-foreground [--spacing-gutter:16px]">
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
 * The filters on a computer: Where, When and Language, each opening a small menu with the same
 * questions and live counts the phone's filters ask (`shownGroups`). Nothing is open until a button
 * is pressed, and every tap applies at once (`usePanelFilters`).
 *
 * - **Where**: Near me, the place in scope, and online or in person.
 * - **When**: the days and the times of day, with frequency and dates under More filters.
 * - **Language**: the languages classes here are held in.
 */
export function FilterChipBar({ placement }: FilterChipBarProps) {
  const { t } = useTranslation()
  const { formatLocale, languageLabel } = useLocale()
  const { filters, facets, write, canClear, clear, pickPlace, clearWhere } = usePanelFilters()
  const [searchParams] = useSearchParams()
  const center = parseCenter(searchParams.get('center'))
  const nearMe = useNearVisitor(center)
  const { data: regions } = useQuery(regionsQuery())
  const block = {
    value: filters,
    facets,
    patch: (next: Partial<EventFilters>) => write({ ...filters, ...next }),
  }
  const shown = shownGroups(filters, facets)
  // After a failed location, the list's search box beside these buttons takes the focus, and
  // nothing needs closing to reach it.
  const stayOpen = () => {}
  // The calendar does not rank by place, so it has no Near me, and its Where is only a scope.
  const searchable = placement === 'map'
  const weekdays = weekdayNames(formatLocale, 'short')

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
  const languageSummary = summarize([filters.languages.map(languageLabel).join(', ')])
  const recovery = facets?.counts.total === 0 ? facets.recovery : undefined
  // With nothing left, each menu ends on the one change that brings the most classes back.
  const footer = facets?.counts.total === 0 && (
    <div className="flex flex-col gap-2 border-t border-divider pt-3">
      <p className="text-sm text-foreground" role="status">
        {t('filters.chrome.no_match')}
      </p>
      {recovery && (
        <RecoveryButton
          className="h-auto min-h-11 w-full py-2 whitespace-normal"
          filters={filters}
          recovery={recovery}
          onApply={write}
        />
      )}
    </div>
  )

  return (
    <div
      aria-label={t('filters.chrome.title')}
      // Over the map the row spans the map between the panel and the controls, so it lets every
      // press through but its buttons' own. Physical sides, as the panel and the controls have.
      className={clsx(
        'pointer-events-none flex flex-wrap items-center justify-end gap-2',
        placement === 'map' ? 'fixed top-4 z-30' : 'ms-auto',
      )}
      role="group"
      style={
        placement === 'map' ? { left: PANEL_CLEARANCE_PX, right: CONTROLS_CLEARANCE_PX } : undefined
      }
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
      {(searchable || shown.format || filters.region) && (
        <FilterChip
          // A place page names its place without counting it as an answer.
          filled={Boolean(center) || filters.format !== 'any'}
          label={t('filters.where.label')}
          summary={summarize([placeName, formatName])}
        >
          <WhereFilter
            counts={
              facets && {
                inPerson: facets.counts.format.offline,
                online: facets.counts.format.online,
              }
            }
            region={filters.region}
            searchable={searchable}
            onClear={clearWhere}
            onPlace={pickPlace}
            onSearchInstead={stayOpen}
          />
          <FormatFilter {...block} />
          {footer}
        </FilterChip>
      )}
      <FilterChip
        filled={Boolean(whenSummary)}
        label={t('filters.when.label')}
        summary={whenSummary}
      >
        <DayFilter {...block} />
        <TimeFilter {...block} />
        <MoreFilters {...block} />
        {footer}
      </FilterChip>
      {shown.languages && (
        <FilterChip
          filled={Boolean(languageSummary)}
          label={t('filters.language.label')}
          summary={languageSummary}
        >
          <LanguageFilter {...block} layout="list" />
          {footer}
        </FilterChip>
      )}
    </div>
  )
}
