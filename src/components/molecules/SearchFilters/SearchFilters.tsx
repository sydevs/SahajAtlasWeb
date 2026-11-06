import type { TranslationKey } from '@/types/i18next'
import type { FilterFacets } from '@/hooks/use-filter-facets'

import { type ReactNode, useMemo, useState } from 'react'
import { Info } from 'luxon'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Sun } from 'lucide-react'
import clsx from 'clsx'

import { Checkbox } from '@/components/atoms/Checkbox'
import { WmIcon } from '@/components/atoms/Icons/wm'
import { Dropdown } from '@/components/atoms/Dropdown'
import { Input } from '@/components/atoms/Input'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { fieldChrome } from '@/components/atoms/Select'
import { useLocale } from '@/hooks/use-locale'
import {
  type EventCadence,
  type EventFilters,
  type EventFormat,
  type TimePeriod,
  TIME_PERIODS,
  dateWindow,
  isDateRestricted,
} from '@/lib/shape'

// The Format and Frequency toggle options, in display order. The i18n leaf
// key for each is just the lowercased value (`recurrenceType` is
// upper-case on the wire), so no lookup map is needed.
//
// The toggles omit the "any" option: nothing selected means any, and clicking the
// SELECTED option clears it. Radix's single-select fires `onValueChange('')` on
// deselect, and `'any'` is the sentinel the URL codec omits, which is what the
// `|| 'any'` below maps that to.
const FORMAT_OPTIONS: EventFormat[] = ['offline', 'online']
const CADENCE_OPTIONS: EventCadence[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'once']

// The We Meditate app's own sunrise and moon, in the app's own yellow and blue (#ffd591, #a1c3d7:
// the colours in sunrise.svg and moon.svg), as on its reminder sheet (Anton, 6 Nov). At 20px the
// app's fine lines wash out, so a 0.75px outline in the same colour thickens them a little
// (`vector-effect` keeps it 0.75px at any size). The app has no afternoon icon, so afternoon takes
// a sun line icon in the sunrise's yellow.
const SUN_YELLOW = 'text-[#ffd591]'
const MOON_BLUE = 'text-[#a1c3d7]'
const THICKER =
  '[&_path]:[stroke:currentColor] [&_path]:[stroke-width:0.75px] [&_path]:[vector-effect:non-scaling-stroke]'
const TIME_ICONS: Record<TimePeriod, ReactNode> = {
  morning: <WmIcon className={clsx(SUN_YELLOW, THICKER)} name="sunrise" size={22} />,
  afternoon: (
    <Sun aria-hidden className={clsx('shrink-0', SUN_YELLOW)} size={20} strokeWidth={1.75} />
  ),
  evening: <WmIcon className={clsx(MOON_BLUE, THICKER)} name="moon" size={20} />,
}

// How many languages still read better as one tap each than as a dropdown.
const INLINE_LANGUAGES = 4

/** One filter group: a plain heading above its control. */
function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      {children}
    </section>
  )
}

/** A quiet live count beside an option. It takes the option's colour once selected. */
function OptionCount({ count }: { count: number | undefined }) {
  if (count === undefined) return null

  return (
    <span className="text-xs font-normal text-gray-11 tabular-nums in-data-[state=on]:text-inherit">
      {count}
    </span>
  )
}

export type FilterControlProps = {
  value: EventFilters
  /** Patch one or more fields of the current filters. */
  patch: (next: Partial<EventFilters>) => void
  facets?: FilterFacets
  /** Passed by the dropdown chips, where the group's heading is the chip itself. */
  className?: string
}

export function FormatFilter({ value, patch, facets, className }: FilterControlProps) {
  const { t } = useTranslation()
  const counts = facets?.counts.format

  return (
    <ToggleGroup
      aria-label={t('filters.format.label')}
      className={clsx('grid grid-cols-2 gap-1', className)}
      type="single"
      value={value.format}
      onValueChange={(next) => patch({ format: (next || 'any') as EventFormat })}
    >
      {FORMAT_OPTIONS.map((option) => {
        const count = option === 'any' ? undefined : counts?.[option]

        return (
          <ToggleGroupItem
            key={option}
            className="h-11 gap-1.5"
            disabled={count === 0 && value.format !== option}
            value={option}
          >
            {t(`filters.format.${option}`)}
            <OptionCount count={count} />
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}

/**
 * A week strip: seven equal cells, Monday first. A day with nothing on it can't be picked.
 *
 * Under 288px wide (the desktop filters panel, a narrow host box) the names drop to 12px: at 14px
 * a 33px cell leaves "Wed" a pixel from each border. The full name is each cell's label.
 */
export function DayFilter({ value, patch, facets, className }: FilterControlProps) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  // luxon's weekdays are 1 (Mon) through 7 (Sun), the store's day encoding.
  const weekdays = useMemo(() => {
    const short = Info.weekdays('short', { locale })
    const long = Info.weekdays('long', { locale })

    return short.map((label, index) => ({ value: index + 1, label, full: long[index] }))
  }, [locale])

  return (
    <ToggleGroup
      aria-label={t('filters.days.short_label')}
      className={clsx('@container grid grid-cols-7 gap-1', className)}
      type="multiple"
      value={value.daysOfWeek.map(String)}
      onValueChange={(next) => patch({ daysOfWeek: next.map(Number) })}
    >
      {weekdays.map((day) => (
        <ToggleGroupItem
          key={day.value}
          aria-label={day.full}
          className="h-11 min-w-0 px-0 @max-[288px]:text-xs"
          disabled={facets?.counts.days[day.value] === 0 && !value.daysOfWeek.includes(day.value)}
          value={String(day.value)}
        >
          {day.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * Three times of day, stacked: each a full-width row with its icon, name and count, so the long
 * names never squeeze in the narrow desktop panel.
 */
export function TimeFilter({ value, patch, facets, className }: FilterControlProps) {
  const { t } = useTranslation()

  return (
    <ToggleGroup
      aria-label={t('filters.time.label')}
      className={clsx('flex flex-col items-stretch gap-1', className)}
      type="multiple"
      value={value.timeOfDay}
      onValueChange={(next) => patch({ timeOfDay: next as TimePeriod[] })}
    >
      {TIME_PERIODS.map((period) => {
        const count = facets?.counts.time[period]

        return (
          <ToggleGroupItem
            key={period}
            className="h-11 w-full justify-start gap-2.5 px-3"
            disabled={count === 0 && !value.timeOfDay.includes(period)}
            value={period}
          >
            <span className="flex w-[22px] shrink-0 justify-center">{TIME_ICONS[period]}</span>
            <span className="flex-1 text-start">{t(`filters.time.${period}`)}</span>
            <OptionCount count={count} />
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}

/**
 * Languages: one tap each when there are few, a dropdown when there are many. The options are
 * the languages classes in this scope actually use, most-used first.
 */
export function LanguageFilter({ value, patch, facets, className }: FilterControlProps) {
  const { t } = useTranslation()
  const { languageLabel } = useLocale()
  const options = facets?.counts.languages ?? []
  const toggle = (code: string) =>
    patch({
      languages: value.languages.includes(code)
        ? value.languages.filter((other) => other !== code)
        : [...value.languages, code],
    })

  if (options.length <= INLINE_LANGUAGES) {
    return (
      <ToggleGroup
        aria-label={t('filters.language.label')}
        className={clsx('grid grid-cols-2 gap-1', className)}
        type="multiple"
        value={value.languages}
        onValueChange={(next) => patch({ languages: next })}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.code}
            className="h-11 justify-between gap-2 px-3"
            disabled={option.count === 0 && !value.languages.includes(option.code)}
            value={option.code}
          >
            <span className="truncate">{languageLabel(option.code)}</span>
            <OptionCount count={option.count} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )
  }

  const selected = value.languages.map(languageLabel).join(', ')

  return (
    <Dropdown
      fullWidth
      aria-label={t('filters.language.label')}
      className={className}
      role="dialog"
      trigger={
        <span className={fieldChrome({ trigger: true, highlight: value.languages.length > 0 })}>
          <span className="truncate">{selected || t('filters.language.all')}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        </span>
      }
    >
      <div className="max-h-64 overflow-y-auto p-1">
        {options.map((option) => (
          <Checkbox
            key={option.code}
            appearance="checkbox"
            checked={value.languages.includes(option.code)}
            className="w-full rounded px-2 py-2 hover:bg-gray-3"
            disabled={option.count === 0 && !value.languages.includes(option.code)}
            onCheckedChange={() => toggle(option.code)}
          >
            <span className="flex w-full items-baseline justify-between gap-3">
              {languageLabel(option.code)}
              <OptionCount count={option.count} />
            </span>
          </Checkbox>
        ))}
      </div>
    </Dropdown>
  )
}

// Clamp a typed date into [min, max]. A native date input enforces min and max in its
// calendar UI, but not for keyboard entry. This keeps the live count in step with what the
// URL codec accepts, and the From/To pair from being typed into a reversed range.
const clampDate = (value: string, min: string, max: string): string => {
  if (value < min) return min
  if (value > max) return max

  return value
}

function DateBound({
  label,
  value,
  min,
  max,
  highlight,
  onChange,
}: {
  label: string
  value: string
  min: string
  max: string
  highlight?: boolean
  onChange: (value: string | null) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-gray-11">
      {label}
      {/* iOS Safari gives a date input an intrinsic minimum width, so in a two-column row
          From grew over To and To ran off the screen. `appearance-none` drops that intrinsic
          size, and `min-w-0 w-full` then lets the grid column decide. */}
      <Input
        className="w-full min-w-0 appearance-none px-2"
        highlight={highlight}
        max={max}
        min={min}
        type="date"
        value={value}
        onChange={(event) =>
          onChange(event.target.value ? clampDate(event.target.value, min, max) : null)
        }
      />
    </label>
  )
}

/** The rarely useful filters: most classes are weekly, so neither narrows much. */
function MoreFilters({ value, patch, facets }: FilterControlProps) {
  const { t } = useTranslation()
  const { cadence, dateRange } = value
  const active = cadence !== 'any' || isDateRestricted(dateRange)
  const [open, setOpen] = useState(active)
  // Bounded to today through today plus 12 months, the window the URL codec clamps to.
  const { min: dateMin, max: dateMax } = dateWindow()
  const counts = facets?.counts.cadence
  const showCadence = cadence !== 'any' || (facets?.relevance.cadence ?? true)
  const cadenceOptions = CADENCE_OPTIONS.filter(
    (option) => option !== 'any' && (!counts || counts[option] > 0 || option === cadence),
  )

  return (
    <div className="flex flex-col">
      <button
        aria-expanded={open}
        className="-mx-4 flex min-h-11 items-center justify-between gap-2 px-4 text-sm font-semibold text-foreground outline-none hover:bg-gray-3 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex items-center gap-2">
          {t('filters.more.label')}
          {active && !open && <span aria-hidden className="size-2 rounded-full bg-primary-9" />}
        </span>
        <ChevronDown
          aria-hidden
          className={clsx('shrink-0 text-gray-11 transition-transform', open && 'rotate-180')}
          size={18}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-5 pt-2">
          {showCadence && (
            <FilterGroup label={t('filters.cadence.label')}>
              <ToggleGroup
                aria-label={t('filters.cadence.label')}
                className="grid grid-cols-2 gap-1"
                type="single"
                value={cadence}
                onValueChange={(next) => patch({ cadence: (next || 'any') as EventCadence })}
              >
                {cadenceOptions.map((option) => (
                  <ToggleGroupItem key={option} className="h-11 gap-1.5" value={option}>
                    {t(`filters.cadence.${option.toLowerCase()}` as TranslationKey)}
                    {option !== 'any' && <OptionCount count={counts?.[option]} />}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FilterGroup>
          )}
          <FilterGroup label={t('filters.dates.label')}>
            <div className="grid grid-cols-2 gap-2">
              <DateBound
                highlight={dateRange.start !== null}
                label={t('filters.dates.from')}
                max={dateRange.end ?? dateMax}
                min={dateMin}
                value={dateRange.start ?? ''}
                onChange={(start) => patch({ dateRange: { ...dateRange, start } })}
              />
              <DateBound
                highlight={dateRange.end !== null}
                label={t('filters.dates.to')}
                max={dateMax}
                min={dateRange.start ?? dateMin}
                value={dateRange.end ?? ''}
                onChange={(end) => patch({ dateRange: { ...dateRange, end } })}
              />
            </div>
          </FilterGroup>
        </div>
      )}
    </div>
  )
}

export type SearchFiltersProps = {
  /** The filter values the form edits. */
  value: EventFilters
  /** Called with the next values on every change. */
  onChange: (filters: EventFilters) => void
  /** The Where group, which needs the router and the geocoder, so the view supplies it. */
  where?: ReactNode
  /** Live counts and relevance. Without them, every group shows, with no numbers. */
  facets?: FilterFacets
  /**
   * No place is chosen yet, and one can be. The form then asks only that, plus the online route,
   * because "Tuesday, anywhere on earth" rarely helps. The other questions stay one tap away.
   */
  placeFirst?: boolean
}

/**
 * A plain full-width row, for a route the visitor can take instead of choosing a place. In a list
 * under 288px wide (the desktop filters panel) the label steps down to 14px, so "Online classes,
 * from anywhere" stays on one line beside its count.
 */
function RouteRow({
  label,
  count,
  onClick,
}: {
  label: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      className="-mx-4 flex min-h-14 items-center justify-between gap-2 px-4 text-start text-base font-medium text-foreground outline-none hover:bg-gray-3 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset @max-[288px]:text-sm"
      type="button"
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        <OptionCount count={count} />
        <ChevronRight aria-hidden className="text-gray-11 rtl:rotate-180" size={18} />
      </span>
    </button>
  )
}

/**
 * The filter form, in the order a visitor decides: where, then online or in person, then when,
 * then language, with the rarely useful ones folded away. A group that can't change the results
 * in this scope isn't shown, unless it is already in use, so it can always be undone.
 *
 * Every option is one chip style. The groups differ by how they're laid out (a pair, a week
 * strip, a 2x2), not by how a chip is drawn, so nothing has to be learned twice.
 */
export function SearchFilters({
  value,
  onChange,
  where,
  facets,
  placeFirst = false,
}: SearchFiltersProps) {
  const { t } = useTranslation()
  const [askEverything, setAskEverything] = useState(false)
  const relevance = facets?.relevance
  const control: FilterControlProps = {
    value,
    facets,
    patch: (next) => onChange({ ...value, ...next }),
  }
  // A question already answered stays on screen, so it can always be undone.
  const answered =
    value.format !== 'any' ||
    value.daysOfWeek.length > 0 ||
    value.timeOfDay.length > 0 ||
    value.languages.length > 0 ||
    value.cadence !== 'any' ||
    isDateRestricted(value.dateRange)

  if (placeFirst && !askEverything && !answered) {
    return (
      <div className="flex flex-col gap-4">
        {where}
        <div className="@container -mx-4 flex flex-col divide-y divide-divider border-t border-divider px-4">
          <RouteRow
            count={facets?.counts.format.online}
            label={t('filters.where.online_route')}
            onClick={() => control.patch({ format: 'online' })}
          />
          <RouteRow label={t('filters.where.anywhere')} onClick={() => setAskEverything(true)} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {where}
      {(value.format !== 'any' || (relevance?.format ?? true)) && (
        <FilterGroup label={t('filters.format.question')}>
          <FormatFilter {...control} />
        </FilterGroup>
      )}
      {(value.daysOfWeek.length > 0 || (relevance?.days ?? true)) && (
        <FilterGroup label={t('filters.days.short_label')}>
          <DayFilter {...control} />
        </FilterGroup>
      )}
      {(value.timeOfDay.length > 0 || (relevance?.time ?? true)) && (
        <FilterGroup label={t('filters.time.label')}>
          <TimeFilter {...control} />
        </FilterGroup>
      )}
      {(value.languages.length > 0 || relevance?.languages) && (
        <FilterGroup label={t('filters.language.label')}>
          <LanguageFilter {...control} />
        </FilterGroup>
      )}
      <MoreFilters {...control} />
    </div>
  )
}
