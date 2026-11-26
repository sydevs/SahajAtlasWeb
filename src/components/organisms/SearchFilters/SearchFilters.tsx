import type { TranslationKey } from '@/types/i18next'

import { type ReactNode, useMemo } from 'react'
import { Info } from 'luxon'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'

import { Checkbox } from '@/components/atoms/Checkbox'
import { Disclosure } from '@/components/atoms/Disclosure'
import { Dropdown } from '@/components/atoms/Dropdown'
import { Input } from '@/components/atoms/Input'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { fieldChrome } from '@/components/atoms/Select'
import { type FieldControlProps, FormField } from '@/components/molecules/FormField'
import { useLocale } from '@/hooks/use-locale'
import { formatTimePeriods } from '@/lib'
import {
  EVENT_CADENCES,
  type EventCadence,
  type EventFilters,
  type EventFormat,
  type FilterFacets,
  type TimePeriod,
  TIME_PERIODS,
  dateWindow,
  isDateRestricted,
  isTimeRestricted,
  shownGroups,
} from '@/lib/shape'

// How many languages still read better as one tap each than as a dropdown.
const INLINE_LANGUAGES = 4

// The single-select questions offer no "any": nothing selected means any.
// ⚠ Pressing the SELECTED option clears it: Radix fires `onValueChange('')` on deselect, and the
// `|| 'any'` below maps that to the sentinel the URL codec omits. A truthiness guard once
// swallowed it, leaving these questions settable but not unsettable from the control itself.
const FORMAT_OPTIONS: Exclude<EventFormat, 'any'>[] = ['offline', 'online']

/** A quiet live count beside an option. It takes the option's colour once selected. */
function OptionCount({ count }: { count: number | undefined }) {
  if (count === undefined) return null

  return (
    <span className="text-xs font-normal text-gray-11 tabular-nums in-data-[state=on]:text-inherit">
      {count}
    </span>
  )
}

type Choice = { value: string; label: ReactNode; count?: number; title?: string }

type ChoicesProps = {
  control: FieldControlProps
  options: Choice[]
  className: string
  itemClassName?: string
  /** Counts still disable an empty option, but are not printed (the week strip has no room). */
  hideCounts?: boolean
  /** Flush, as one segmented control, where a gap would take items under the 44px tap floor. */
  joined?: boolean
} & (
  | { type: 'single'; value: string; onValueChange: (value: string) => void }
  | { type: 'multiple'; value: string[]; onValueChange: (value: string[]) => void }
)

/**
 * One question's options, each with its live count. An option that would leave no classes is
 * disabled, unless it is already chosen, so it can always be undone.
 */
function Choices({
  control,
  options,
  className,
  itemClassName,
  hideCounts,
  joined,
  ...selection
}: ChoicesProps) {
  const chosen = (value: string) =>
    selection.type === 'single' ? selection.value === value : selection.value.includes(value)

  return (
    <ToggleGroup {...control} {...selection} className={className} joined={joined} size="md">
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          className={itemClassName}
          disabled={option.count === 0 && !chosen(option.value)}
          title={option.title}
          value={option.value}
        >
          {option.label}
          {!hideCounts && <OptionCount count={option.count} />}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

type QuestionProps = {
  name: string
  label: string
  /** The field has an answer, so its Clear shows. */
  active: boolean
  onClear: () => void
  children: (control: FieldControlProps) => ReactNode
}

/** One filter question: a `FormField` fieldset, named by its legend, with a Clear for its answer. */
function Question({ name, label, active, onClear, children }: QuestionProps) {
  const { t } = useTranslation()

  return (
    <FormField
      as="fieldset"
      clear={{ label: t('filters.chrome.clear_one'), active, onClear }}
      label={label}
      name={name}
    >
      {children}
    </FormField>
  )
}

// Clamp a typed date into [min, max]. A native date input enforces min
// and max in its calendar UI, but not for keyboard entry. So this clamps
// on change. That keeps the draft, and its live "Apply (N)" count, in
// step with what the URL codec accepts, and keeps the From/To pair from
// being typed into a reversed range.
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
      {/* iOS Safari gives a date field an intrinsic minimum width of its own, wider than half
          a phone sheet, so From and To overlapped and To ran off the edge. `appearance-none`
          drops it, and `min-w-0 w-full` lets the grid column decide. */}
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

type ControlProps = {
  value: EventFilters
  patch: (next: Partial<EventFilters>) => void
  facets?: FilterFacets
}

/**
 * Languages: one tap each when there are few, a dropdown when there are many. The options are
 * the languages classes in this scope use, most-used first, plus any already chosen that this
 * scope lacks, so every answer can still be undone.
 */
function LanguageFilter({
  value,
  patch,
  facets,
  control,
}: ControlProps & { control: FieldControlProps }) {
  const { t } = useTranslation()
  const { languageLabel } = useLocale()
  const { languages } = value
  const inScope = facets?.counts.languages ?? []
  const options = [
    ...inScope,
    ...languages
      .filter((code) => !inScope.some((option) => option.code === code))
      .map((code) => ({ code, count: 0 })),
  ]

  if (options.length <= INLINE_LANGUAGES) {
    return (
      <Choices
        className="grid grid-cols-2"
        control={control}
        itemClassName="justify-between gap-2 px-3"
        options={options.map((option) => ({
          value: option.code,
          label: <span className="truncate">{languageLabel(option.code)}</span>,
          count: option.count,
        }))}
        type="multiple"
        value={languages}
        onValueChange={(next) => patch({ languages: next })}
      />
    )
  }

  const selected = languages.map(languageLabel).join(', ')

  return (
    <Dropdown
      fullWidth
      aria-label={t('filters.language.label')}
      role="dialog"
      trigger={
        <span className={fieldChrome({ trigger: true, highlight: languages.length > 0 })}>
          <span className="truncate">{selected || t('filters.language.all')}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        </span>
      }
    >
      <div className="max-h-56 overflow-y-auto p-1">
        {options.map((option) => (
          <Checkbox
            key={option.code}
            appearance="checkbox"
            checked={languages.includes(option.code)}
            className="w-full rounded-lg px-2 py-1.5 hover:bg-gray-3"
            disabled={option.count === 0 && !languages.includes(option.code)}
            onCheckedChange={() =>
              patch({
                languages: languages.includes(option.code)
                  ? languages.filter((code) => code !== option.code)
                  : [...languages, option.code],
              })
            }
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

/** Frequency and Dates, folded away: most classes are weekly, so neither narrows much. */
function MoreFilters({ value, patch, facets }: ControlProps) {
  const { t } = useTranslation()
  const { cadence, dateRange } = value
  // The date picker is bounded to today through today plus 12 months, the window the URL codec
  // clamps to.
  const { min: dateMin, max: dateMax } = dateWindow()

  return (
    <Disclosure
      defaultOpen={cadence !== 'any' || isDateRestricted(dateRange)}
      title={t('filters.more.label')}
    >
      <div className="flex flex-col gap-5">
        {shownGroups(value, facets).cadence && (
          <Question
            active={cadence !== 'any'}
            label={t('filters.cadence.label')}
            name="filter-cadence"
            onClear={() => patch({ cadence: 'any' })}
          >
            {(control) => (
              <Choices
                className="grid grid-cols-2"
                control={control}
                itemClassName="gap-1.5"
                options={EVENT_CADENCES.map((option) => ({
                  value: option,
                  label: t(`filters.cadence.${option.toLowerCase()}` as TranslationKey),
                  count: facets?.counts.cadence[option],
                }))}
                type="single"
                value={cadence}
                onValueChange={(next) => patch({ cadence: (next || 'any') as EventCadence })}
              />
            )}
          </Question>
        )}
        <Question
          active={isDateRestricted(dateRange)}
          label={t('filters.dates.label')}
          name="filter-dates"
          onClear={() => patch({ dateRange: { start: null, end: null } })}
        >
          {() => (
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
          )}
        </Question>
      </div>
    </Disclosure>
  )
}

export type SearchFiltersProps = {
  /** The (draft) filter values the form edits. */
  value: EventFilters
  /** Called with the next draft on every change. The host applies it on demand. */
  onChange: (filters: EventFilters) => void
  /** The Where group, which needs the router and the geocoder, so the view supplies it. */
  where?: ReactNode
  /** Live counts and relevance. Without them every group but Language shows, with no numbers. */
  facets?: FilterFacets
}

/**
 * The event-filters form, in the order a visitor decides: where, online or in person, day, time
 * of day, language, then Frequency and Dates under "More filters". This is fully controlled: it
 * edits `value` and reports the next draft through `onChange`, so the host (FilterView) applies
 * it on demand. Each question is a `FormField` fieldset over a `size="md"` `ToggleGroup`.
 *
 * A question that cannot change the results in this scope is not asked, unless it is already
 * answered (`shownGroups`).
 */
export function SearchFilters({ value, onChange, where, facets }: SearchFiltersProps) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { format, timeOfDay, daysOfWeek, languages } = value
  const shown = shownGroups(value, facets)
  const counts = facets?.counts

  const patch = (next: Partial<EventFilters>) => onChange({ ...value, ...next })

  // Mon-first: luxon's `Info.weekdays` is 1 (Mon) through 7 (Sun), the store's day encoding.
  const weekdays = useMemo(() => {
    const short = Info.weekdays('short', { locale })
    const long = Info.weekdays('long', { locale })

    return short.map((label, index) => ({ value: index + 1, label, full: long[index] }))
  }, [locale])

  return (
    <div className="flex flex-col gap-5">
      {where}

      {shown.format && (
        <Question
          active={format !== 'any'}
          label={t('filters.format.question')}
          name="filter-format"
          onClear={() => patch({ format: 'any' })}
        >
          {(control) => (
            <Choices
              className="grid grid-cols-2"
              control={control}
              itemClassName="gap-1.5"
              options={FORMAT_OPTIONS.map((option) => ({
                value: option,
                label: t(`filters.format.${option}`),
                count: counts?.format[option],
              }))}
              type="single"
              value={format}
              onValueChange={(next) => patch({ format: (next || 'any') as EventFormat })}
            />
          )}
        </Question>
      )}

      {shown.days && (
        <Question
          active={daysOfWeek.length > 0}
          label={t('filters.days.short_label')}
          name="filter-days"
          onClear={() => patch({ daysOfWeek: [] })}
        >
          {(control) => (
            // The abbreviation is the accessible name, not the full day: a name a viewer cannot
            // see is one a speech-input viewer cannot say (WCAG 2.5.3). `title` keeps the full
            // name within reach of a pointer.
            // ⚠ Joined: seven gapped days measured 39px wide each at a 390px screen, under the
            // 44px tap floor (#432); flush, they keep it down to a 360px phone.
            <Choices
              hideCounts
              joined
              className="grid grid-cols-7"
              control={control}
              itemClassName="min-w-0 px-0"
              options={weekdays.map((day) => ({
                value: String(day.value),
                label: day.label,
                count: counts?.days[day.value],
                title: day.full,
              }))}
              type="multiple"
              value={daysOfWeek.map(String)}
              onValueChange={(next) => patch({ daysOfWeek: next.map(Number) })}
            />
          )}
        </Question>
      )}

      {shown.time && (
        <Question
          active={isTimeRestricted(timeOfDay)}
          label={t('filters.time.label')}
          name="filter-time"
          onClear={() => patch({ timeOfDay: [] })}
        >
          {(control) => (
            <div className="flex flex-col gap-2">
              <Choices
                className="grid grid-cols-2"
                control={control}
                itemClassName="justify-between gap-2 px-3"
                options={TIME_PERIODS.map((period) => ({
                  value: period,
                  label: t(`filters.time.${period}`),
                  count: counts?.time[period],
                }))}
                type="multiple"
                value={timeOfDay}
                onValueChange={(next) => patch({ timeOfDay: next as TimePeriod[] })}
              />
              {/* The same times the active-filter pill shows. */}
              {timeOfDay.length > 0 && (
                <p className="text-xs text-gray-11">{formatTimePeriods(locale, timeOfDay)}</p>
              )}
            </div>
          )}
        </Question>
      )}

      {shown.languages && (
        <Question
          active={languages.length > 0}
          label={t('filters.language.label')}
          name="filter-languages"
          onClear={() => patch({ languages: [] })}
        >
          {(control) => (
            <LanguageFilter control={control} facets={facets} patch={patch} value={value} />
          )}
        </Question>
      )}

      <MoreFilters facets={facets} patch={patch} value={value} />
    </div>
  )
}
