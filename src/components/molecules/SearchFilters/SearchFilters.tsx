import type { TranslationKey } from '@/types/i18next'
import type { FilterFacets } from '@/hooks/use-filter-facets'

import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, MoonStar, Sun } from 'lucide-react'
import clsx from 'clsx'

import { Checkbox } from '@/components/atoms/Checkbox'
import { WmIcon } from '@/components/atoms/Icons/wm'
import { Dropdown } from '@/components/atoms/Dropdown'
import { Input } from '@/components/atoms/Input'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { fieldChrome } from '@/components/atoms/Select'
import { useLocale } from '@/hooks/use-locale'
import { formatTimePeriods } from '@/lib/events'
import { regionalLocale, weekdayNames } from '@/lib/time'
import {
  type EventCadence,
  type EventFilters,
  type EventFormat,
  type TimePeriod,
  TIME_PERIODS,
  dateWindow,
  isDateRestricted,
  shownGroups,
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

// The We Meditate app's own sunrise and moon, in the text colour like every other control here:
// Anton tried the app's yellow and blue (6 Nov) and found they pulled too much attention. At 20px
// the app's fine lines are faint, so a 0.75px outline (`vector-effect` keeps it 0.75px at any size)
// brings them to the weight of the sun beside them. The app has no afternoon or night icon, so
// those take line icons: a sun, and a moon with a star, which tells night apart from evening.
const THICKER =
  '[&_path]:[stroke:currentColor] [&_path]:[stroke-width:0.75px] [&_path]:[vector-effect:non-scaling-stroke]'
const TIME_ICONS: Record<TimePeriod, ReactNode> = {
  morning: <WmIcon className={THICKER} name="sunrise" size={22} />,
  afternoon: <Sun aria-hidden className="shrink-0" size={20} strokeWidth={1.75} />,
  evening: <WmIcon className={THICKER} name="moon" size={20} />,
  night: <MoonStar aria-hidden className="shrink-0" size={20} strokeWidth={1.75} />,
}

// How many languages still read better as one tap each than as a dropdown.
const INLINE_LANGUAGES = 4

export type FilterGroupProps = { label: string; children: ReactNode }

/** One filter group: a plain heading above its control. */
export function FilterGroup({ label, children }: FilterGroupProps) {
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
  /** Extra classes for the control's own wrapper, for a surface that lays it out itself. */
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
 * Under 288px wide (the When popover on a computer, a narrow host box) the names drop to 12px: at
 * 14px a 33px cell leaves "Wed" a pixel from each border. The full name is each cell's label.
 */
export function DayFilter({ value, patch, facets, className }: FilterControlProps) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  // Monday first, so index + 1 is the ISO weekday, the store's day encoding.
  const weekdays = useMemo(() => {
    const short = weekdayNames(regionalLocale(locale), 'short')
    const long = weekdayNames(regionalLocale(locale))

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
 * The times of day, stacked: each a full-width row with its icon, name, hours and count, so the
 * long names never squeeze in a narrow popover.
 *
 * The hours sit faded beside each name (Devindra, 12 Nov), written by the same `Intl` formatter as
 * every other time on screen, so a visitor reads "6:00 AM" or "06:00" as their locale does. Night is
 * offered only while classes start in it, and is then hidden rather than greyed when none do: in
 * practice that is online classes from far-off time zones, so an in-person list never shows it. A
 * selected Night stays, so it can always be undone.
 */
export function TimeFilter({ value, patch, facets, className }: FilterControlProps) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const periods = TIME_PERIODS.filter(
    (period) =>
      period !== 'night' ||
      value.timeOfDay.includes(period) ||
      (facets?.counts.time.night ?? 0) > 0,
  )

  return (
    <ToggleGroup
      aria-label={t('filters.time.label')}
      className={clsx('flex flex-col items-stretch gap-1', className)}
      type="multiple"
      value={value.timeOfDay}
      onValueChange={(next) => patch({ timeOfDay: next as TimePeriod[] })}
    >
      {periods.map((period) => {
        const count = facets?.counts.time[period]

        return (
          <ToggleGroupItem
            key={period}
            className="h-11 w-full justify-start gap-2.5 px-3"
            disabled={count === 0 && !value.timeOfDay.includes(period)}
            value={period}
          >
            <span className="flex w-[22px] shrink-0 justify-center">{TIME_ICONS[period]}</span>
            <span className="flex min-w-0 flex-1 items-baseline gap-2 text-start">
              {t(`filters.time.${period}`)}
              <span className="truncate text-xs font-normal text-gray-11 in-data-[state=on]:text-inherit in-data-[state=on]:opacity-80">
                {formatTimePeriods(locale, [period])}
              </span>
            </span>
            <OptionCount count={count} />
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}

export type LanguageFilterProps = FilterControlProps & {
  /**
   * `list` always shows the options as a list of checkboxes, for a surface that is already a
   * popover, where a dropdown would open inside another one.
   */
  layout?: 'auto' | 'list'
}

/**
 * Languages: one tap each when there are few, a dropdown when there are many. The options are
 * the languages classes in this scope actually use, most-used first.
 */
export function LanguageFilter({
  value,
  patch,
  facets,
  className,
  layout = 'auto',
}: LanguageFilterProps) {
  const { t } = useTranslation()
  const { languageLabel } = useLocale()
  const options = facets?.counts.languages ?? []
  const toggle = (code: string) =>
    patch({
      languages: value.languages.includes(code)
        ? value.languages.filter((other) => other !== code)
        : [...value.languages, code],
    })
  const list = (
    <div className={clsx('max-h-64 overflow-y-auto p-1', layout === 'list' && className)}>
      {options.map((option) => (
        <Checkbox
          key={option.code}
          appearance="checkbox"
          checked={value.languages.includes(option.code)}
          // The label's own wrapper grows, so the count sits at the row's end.
          className="w-full rounded px-2 py-2 hover:bg-gray-3 [&>span]:flex-1"
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
  )

  if (layout === 'list') return list

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
      {list}
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

/**
 * The rarely useful filters, folded away: most classes are weekly, so neither narrows much.
 * `dates={false}` leaves the dates out, where the view sets them itself (the calendar's Week).
 */
export function MoreFilters({
  value,
  patch,
  facets,
  dates = true,
}: FilterControlProps & { dates?: boolean }) {
  const { t } = useTranslation()
  const { cadence, dateRange } = value
  const active = cadence !== 'any' || (dates && isDateRestricted(dateRange))
  const [open, setOpen] = useState(active)
  // Bounded to today through today plus 12 months, the window the URL codec clamps to.
  const { min: dateMin, max: dateMax } = dateWindow()
  const counts = facets?.counts.cadence
  const showCadence = cadence !== 'any' || (facets?.relevance.cadence ?? true)
  const cadenceOptions = CADENCE_OPTIONS.filter(
    (option) => option !== 'any' && (!counts || counts[option] > 0 || option === cadence),
  )

  if (!showCadence && !dates) return null

  return (
    <div className="flex flex-col">
      <button
        aria-expanded={open}
        className="-mx-gutter flex min-h-11 items-center justify-between gap-2 px-gutter text-sm font-semibold text-foreground outline-none hover:bg-gray-3 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
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
          {dates && (
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
          )}
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
  /** False leaves out the From and To dates, for a view that sets its own (`MoreFilters`). */
  dates?: boolean
}

/**
 * The filter form, in the order a visitor decides: where, then online or in person, then when,
 * then language, with the rarely useful ones folded away. Which groups it asks follows
 * `shownGroups`, in the phone's drawer and the computer's panel alike.
 *
 * Every option is one chip style. The groups differ by how they're laid out (a pair, a week
 * strip, a 2x2), not by how a chip is drawn, so nothing has to be learned twice.
 */
export function SearchFilters({ value, onChange, where, facets, dates }: SearchFiltersProps) {
  const { t } = useTranslation()
  const shown = shownGroups(value, facets)
  const control: FilterControlProps = {
    value,
    facets,
    patch: (next) => onChange({ ...value, ...next }),
  }

  return (
    <div className="flex flex-col gap-5">
      {where}
      {shown.format && (
        <FilterGroup label={t('filters.format.question')}>
          <FormatFilter {...control} />
        </FilterGroup>
      )}
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
      {shown.languages && (
        <FilterGroup label={t('filters.language.label')}>
          <LanguageFilter {...control} />
        </FilterGroup>
      )}
      <MoreFilters {...control} dates={dates} />
    </div>
  )
}
