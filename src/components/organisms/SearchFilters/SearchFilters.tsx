import type { TranslationKey } from '@/types/i18next'
import type { FilterFacets } from '@/hooks/use-filter-facets'

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
  type EventCadence,
  type EventFilters,
  type EventFormat,
  type TimePeriod,
  TIME_PERIODS,
  dateWindow,
  isDateRestricted,
  isTimeRestricted,
  shownGroups,
} from '@/lib/shape'

// How many languages still read better as one tap each than as a dropdown.
const INLINE_LANGUAGES = 4

// The Format and Frequency toggle options, in display order. The i18n leaf
// key for each is just the lowercased value (`recurrenceType` is
// upper-case on the wire), so no lookup map is needed.
//
// The Format and Frequency toggles omit the "any" option. A single-select
// toggle can be left unselected, meaning any, and the field's "Clear"
// resets it. So the toggle only shows the real choices.
//
// ⚠ Clicking the SELECTED option clears it. That needs the `|| 'any'` in
// the two `onValueChange`s below. Radix's single-select already fires
// `onValueChange('')` on deselect (`onItemDeactivate`), so the capability
// was always there. A `next && patch(…)` truthiness guard silently
// swallowed it. That left these two dimensions the only filters a user
// could set but not un-set from the control itself, the opposite of what
// the paragraph above says they do. `'any'` is the sentinel the URL codec
// omits, so a cleared group round-trips as an absent parameter and
// matches no ToggleGroupItem, which is what renders the group unselected.
const FORMAT_OPTIONS: Exclude<EventFormat, 'any'>[] = ['offline', 'online']
const CADENCE_OPTIONS: Exclude<EventCadence, 'any'>[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'once']

/** A quiet live count beside an option. It takes the option's colour once selected. */
function OptionCount({ count }: { count: number | undefined }) {
  if (count === undefined) return null

  return (
    <span className="text-xs font-normal text-gray-11 tabular-nums in-data-[state=on]:text-inherit">
      {count}
    </span>
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

// One labelled date bound, From or To: a native date input scoped to the picker window.
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
 * the languages classes in this scope actually use, most-used first.
 */
function LanguageFilter({
  value,
  patch,
  facets,
  control,
}: ControlProps & { control: FieldControlProps }) {
  const { t } = useTranslation()
  const { languageLabel } = useLocale()
  const options = facets?.counts.languages ?? []
  const { languages } = value

  if (options.length <= INLINE_LANGUAGES) {
    return (
      <ToggleGroup
        {...control}
        className="grid grid-cols-2"
        size="md"
        type="multiple"
        value={languages}
        onValueChange={(next) => patch({ languages: next })}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.code}
            className="justify-between gap-2 px-3"
            disabled={option.count === 0 && !languages.includes(option.code)}
            value={option.code}
          >
            <span className="truncate">{languageLabel(option.code)}</span>
            <OptionCount count={option.count} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
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
  const counts = facets?.counts.cadence
  const showCadence = cadence !== 'any' || (facets?.relevance.cadence ?? true)

  return (
    <Disclosure
      defaultOpen={cadence !== 'any' || isDateRestricted(dateRange)}
      title={t('filters.more.label')}
    >
      <div className="flex flex-col gap-5">
        {showCadence && (
          <Question
            active={cadence !== 'any'}
            label={t('filters.cadence.label')}
            name="filter-cadence"
            onClear={() => patch({ cadence: 'any' })}
          >
            {(control) => (
              <ToggleGroup
                {...control}
                className="grid grid-cols-2"
                size="md"
                type="single"
                value={cadence}
                onValueChange={(next) => patch({ cadence: (next || 'any') as EventCadence })}
              >
                {CADENCE_OPTIONS.map((option) => (
                  <ToggleGroupItem
                    key={option}
                    className="gap-1.5"
                    disabled={counts?.[option] === 0 && cadence !== option}
                    value={option}
                  >
                    {t(`filters.cadence.${option.toLowerCase()}` as TranslationKey)}
                    <OptionCount count={counts?.[option]} />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
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
 * answered (`shownGroups`). An option that would leave no classes is disabled unless selected.
 */
export function SearchFilters({ value, onChange, where, facets }: SearchFiltersProps) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { format, timeOfDay, daysOfWeek, languages } = value
  const shown = shownGroups(value, facets)
  const counts = facets?.counts

  // Patch one or more fields of the current draft.
  const patch = (next: Partial<EventFilters>) => onChange({ ...value, ...next })

  // Mon-first weekday pills. luxon's `Info.weekdays` is 1 (Mon) through 7 (Sun), matching the
  // store's day encoding. The full name is the hover title.
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
            <ToggleGroup
              {...control}
              className="grid grid-cols-2"
              size="md"
              type="single"
              value={format}
              onValueChange={(next) => patch({ format: (next || 'any') as EventFormat })}
            >
              {FORMAT_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option}
                  className="gap-1.5"
                  disabled={counts?.format[option] === 0 && format !== option}
                  value={option}
                >
                  {t(`filters.format.${option}`)}
                  <OptionCount count={counts?.format[option]} />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
            <ToggleGroup
              {...control}
              className="grid grid-cols-7"
              size="md"
              type="multiple"
              value={daysOfWeek.map(String)}
              onValueChange={(next) => patch({ daysOfWeek: next.map(Number) })}
            >
              {/* The abbreviation is the accessible name, not the full day. A name a viewer
                  cannot see is a name a speech-input viewer cannot say (WCAG 2.5.3), and the
                  legend already says these are days. `title` keeps the full name within reach
                  of a pointer. */}
              {weekdays.map((day) => (
                <ToggleGroupItem
                  key={day.value}
                  className="min-w-0 px-0"
                  disabled={counts?.days[day.value] === 0 && !daysOfWeek.includes(day.value)}
                  title={day.full}
                  value={String(day.value)}
                >
                  {day.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
              <ToggleGroup
                {...control}
                className="grid grid-cols-2"
                size="md"
                type="multiple"
                value={timeOfDay}
                onValueChange={(next) => patch({ timeOfDay: next as TimePeriod[] })}
              >
                {TIME_PERIODS.map((period) => (
                  <ToggleGroupItem
                    key={period}
                    className="justify-between gap-2 px-3"
                    disabled={counts?.time[period] === 0 && !timeOfDay.includes(period)}
                    value={period}
                  >
                    {t(`filters.time.${period}`)}
                    <OptionCount count={counts?.time[period]} />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {/* The times the selection covers. This is the same string the active-filter pill
                  shows, hidden when nothing is selected. */}
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
