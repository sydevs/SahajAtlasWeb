import { type ReactNode, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info } from 'luxon'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/atoms/Checkbox'
import { Dropdown } from '@/components/atoms/Dropdown'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { Select, SelectItem, fieldChrome } from '@/components/atoms/Select'
import { DownArrowIcon } from '@/components/atoms/Icons'
import api, { regionsQuery } from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useLocale } from '@/hooks/use-locale'
import { formatTimePeriods } from '@/lib'
import {
  type EventCadence,
  type EventFilters,
  type EventFormat,
  type TimePeriod,
  TIME_PERIODS,
  ancestorIds,
  dateWindow,
  indexRegions,
  isDateRestricted,
  isTimeRestricted,
} from '@/lib/shape'

// The Format + Frequency toggle options, in display order. The i18n leaf key for
// each is just the lowercased value (`recurrenceType` is upper-case on the wire),
// so no lookup map is needed.
const FORMAT_OPTIONS: EventFormat[] = ['any', 'offline', 'online']
const CADENCE_OPTIONS: EventCadence[] = ['any', 'DAILY', 'WEEKLY', 'MONTHLY', 'once']

// A labelled filter group — a heading (with an optional right-aligned hint, e.g.
// the time readout) above its control. When the filter is `active`, a small
// "Clear" link after the label resets just that filter via `onClear`.
function FilterGroup({
  label,
  hint,
  active,
  onClear,
  children,
}: {
  label: string
  hint?: string
  active?: boolean
  onClear?: () => void
  children: ReactNode
}) {
  const { t } = useTranslation('common')

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {active && onClear && (
            <button
              className="text-xs font-medium text-primary-11 hover:underline"
              type="button"
              onClick={onClear}
            >
              {t('filters.clear_one')}
            </button>
          )}
        </div>
        {hint && <span className="text-xs text-gray-11">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

// Clamp a typed date into [min, max]. A native date input enforces min/max in its
// calendar UI but not for keyboard entry, so clamp on change — this keeps the draft
// (and its live "Apply (N)" count) in step with what the URL codec accepts, and
// keeps the From/To pair from being typed into a reversed range.
const clampDate = (value: string, min: string, max: string): string => {
  if (value < min) return min
  if (value > max) return max

  return value
}

// One labelled date bound (From / To) — a native date input scoped to the picker
// window. Module-private like `FilterGroup`; both bounds share it so the input
// styling lives in one place.
function DateBound({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  min: string
  max: string
  onChange: (value: string | null) => void
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-gray-11">
      {label}
      <input
        className={fieldChrome({ className: 'px-2' })}
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

export type SearchFiltersProps = {
  /** The (draft) filter values the form edits. */
  value: EventFilters
  /** Called with the next draft on every change; the host applies it on demand. */
  onChange: (filters: EventFilters) => void
}

/**
 * The event-filters form: the Format / Frequency / Day / Time / Language controls.
 * Fully controlled — it edits `value` and reports the next draft via `onChange`; it
 * does not touch the store, so the host (FilterView) can defer applying until the
 * user clicks Apply. Language uses a multi-select dropdown so it scales as more
 * languages appear in the feed; the options are the distinct codes in the cached
 * geojson feed, labelled per locale.
 */
export function SearchFilters({ value, onChange }: SearchFiltersProps) {
  const { t } = useTranslation('common')
  const { locale, languageLabel } = useLocale()
  const { format, timeOfDay, daysOfWeek, languages, cadence, dateRange, region } = value

  // Patch one or more fields of the current draft.
  const patch = (next: Partial<EventFilters>) => onChange({ ...value, ...next })

  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  const { data: regions } = useQuery(regionsQuery())

  // Region options: every region present in the feed (any level with events under
  // it), labelled with a breadcrumb hint so same-named places are distinguishable.
  // The region cut itself (self + descendants) lives in `buildRegionMatcher`.
  const regionOptions = useMemo(() => {
    if (!regions?.length || !geojson) return []

    const index = indexRegions(regions)
    // Many features share a region, so expand ancestry once per DISTINCT region id
    // rather than once per feature.
    const directRegionIds = new Set(geojson.features.map((f) => f.properties.region.id))
    const present = new Set<number>()

    for (const id of directRegionIds) {
      for (const ancestorId of ancestorIds(index, id)) present.add(ancestorId)
    }

    return regions
      .filter((node) => present.has(node.id))
      .map((node) => ({
        value: node.slug,
        label: node.name ?? node.slug,
        hint:
          ancestorIds(index, node.id)
            .slice(1) // drop self → parent … country
            .map((id) => index.byId.get(id)?.name)
            .filter((name): name is string => Boolean(name))
            .reverse() // country → … → parent (top-down breadcrumb)
            .join(' · ') || undefined,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, locale))
  }, [regions, geojson, locale])

  // Mon-first weekday pills; luxon's `Info.weekdays` is 1 (Mon)–7 (Sun), matching
  // the store's day encoding, so the value is the index + 1. `short` (3-char)
  // labels fit one line at the reduced pill size; the full name is the accessible
  // label.
  const weekdays = useMemo(() => {
    const short = Info.weekdays('short', { locale })
    const long = Info.weekdays('long', { locale })

    return short.map((label, index) => ({ value: String(index + 1), label, full: long[index] }))
  }, [locale])

  // The distinct language codes present in the feed, labelled + sorted per locale.
  const languageOptions = useMemo(() => {
    const codes = new Set<string>()

    geojson?.features.forEach((feature) =>
      feature.properties.languages.forEach((code) => codes.add(code)),
    )

    return [...codes]
      .map((code) => ({ code, label: languageLabel(code) }))
      .sort((a, b) => a.label.localeCompare(b.label, locale))
  }, [geojson, languageLabel, locale])

  const timeActive = isTimeRestricted(timeOfDay)
  // Show the selected language names in the trigger (truncated) so the selection is
  // visible at a glance, rather than an opaque count.
  const selectedLanguages = languages.map(
    (code) => languageOptions.find((option) => option.code === code)?.label ?? code,
  )
  const languageTriggerLabel =
    selectedLanguages.length === 0 ? t('filters.language.all') : selectedLanguages.join(', ')
  // The date picker is bounded to today … today + 12 months (the same window the URL
  // codec clamps to). Computed once per render — cheap and always current.
  const { min: dateMin, max: dateMax } = dateWindow()

  return (
    <div className="flex flex-col gap-5">
      <FilterGroup
        active={format !== 'any'}
        label={t('filters.format.label')}
        onClear={() => patch({ format: 'any' })}
      >
        <ToggleGroup
          joined
          aria-label={t('filters.format.label')}
          type="single"
          value={format}
          onValueChange={(next) => next && patch({ format: next as EventFormat })}
        >
          {FORMAT_OPTIONS.map((option) => (
            <ToggleGroupItem key={option} value={option}>
              {t(`filters.format.${option}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FilterGroup>

      <FilterGroup
        active={cadence !== 'any'}
        label={t('filters.cadence.label')}
        onClear={() => patch({ cadence: 'any' })}
      >
        <ToggleGroup
          joined
          aria-label={t('filters.cadence.label')}
          type="single"
          value={cadence}
          onValueChange={(next) => next && patch({ cadence: next as EventCadence })}
        >
          {CADENCE_OPTIONS.map((option) => (
            <ToggleGroupItem key={option} value={option}>
              {t(`filters.cadence.${option.toLowerCase()}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FilterGroup>

      <FilterGroup
        active={daysOfWeek.length > 0}
        label={t('filters.days.label')}
        onClear={() => patch({ daysOfWeek: [] })}
      >
        <ToggleGroup
          aria-label={t('filters.days.label')}
          type="multiple"
          value={daysOfWeek.map(String)}
          onValueChange={(next) => patch({ daysOfWeek: next.map(Number) })}
        >
          {weekdays.map((day) => (
            <ToggleGroupItem key={day.value} aria-label={day.full} value={day.value}>
              {day.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FilterGroup>

      <FilterGroup
        active={timeActive}
        label={t('filters.time.label')}
        onClear={() => patch({ timeOfDay: [] })}
      >
        <div className="flex flex-col gap-2">
          <ToggleGroup
            aria-label={t('filters.time.label')}
            type="multiple"
            value={timeOfDay}
            onValueChange={(next) => patch({ timeOfDay: next as TimePeriod[] })}
          >
            {TIME_PERIODS.map((period) => (
              <ToggleGroupItem key={period} value={period}>
                {t(`filters.time.${period}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {/* The times the selection covers — the same string the active-filter pill shows.
              Empty for no selection (or a whole-day one), so fall back to "any time". */}
          <p className="text-xs text-gray-11">
            {formatTimePeriods(locale, timeOfDay) || t('filters.any_time')}
          </p>
        </div>
      </FilterGroup>

      <FilterGroup
        active={isDateRestricted(dateRange)}
        label={t('filters.dates.label')}
        onClear={() => patch({ dateRange: { start: null, end: null } })}
      >
        <div className="flex items-end gap-2">
          <DateBound
            label={t('filters.dates.from')}
            max={dateRange.end ?? dateMax}
            min={dateMin}
            value={dateRange.start ?? ''}
            onChange={(start) => patch({ dateRange: { ...dateRange, start } })}
          />
          <DateBound
            label={t('filters.dates.to')}
            max={dateMax}
            min={dateRange.start ?? dateMin}
            value={dateRange.end ?? ''}
            onChange={(end) => patch({ dateRange: { ...dateRange, end } })}
          />
        </div>
      </FilterGroup>

      <FilterGroup
        active={languages.length > 0}
        label={t('filters.language.label')}
        onClear={() => patch({ languages: [] })}
      >
        {languageOptions.length === 0 ? (
          <p className="text-sm text-gray-11">{t('filters.language.empty')}</p>
        ) : (
          <Dropdown
            fullWidth
            aria-label={t('filters.language.label')}
            role="dialog"
            trigger={
              <span className={fieldChrome({ trigger: true })}>
                <span className="truncate">{languageTriggerLabel}</span>
                <DownArrowIcon className="h-4 w-4 shrink-0 opacity-70" />
              </span>
            }
          >
            <div className="max-h-56 overflow-y-auto p-1">
              {languageOptions.map((option) => (
                <Checkbox
                  key={option.code}
                  appearance="checkbox"
                  checked={languages.includes(option.code)}
                  className="w-full rounded px-2 py-1.5 hover:bg-gray-3"
                  onCheckedChange={() =>
                    patch({
                      languages: languages.includes(option.code)
                        ? languages.filter((code) => code !== option.code)
                        : [...languages, option.code],
                    })
                  }
                >
                  {option.label}
                </Checkbox>
              ))}
            </div>
          </Dropdown>
        )}
      </FilterGroup>

      {/* Region is a plain list picker (not a free-text combobox): you choose from the
          CMS regions present in the feed, nothing else. Clearing is the group's "Clear". */}
      {regionOptions.length > 0 && (
        <FilterGroup
          active={region !== null}
          label={t('filters.region.label')}
          onClear={() => patch({ region: null })}
        >
          <Select
            aria-label={t('filters.region.label')}
            placeholder={t('filters.region.all')}
            value={region ?? undefined}
            onValueChange={(next) => patch({ region: next })}
          >
            {regionOptions.map((option) => (
              <SelectItem key={option.value} textValue={option.label} value={option.value}>
                <span className="block truncate">{option.label}</span>
                {option.hint && (
                  <span className="block truncate text-xs text-gray-11">{option.hint}</span>
                )}
              </SelectItem>
            ))}
          </Select>
        </FilterGroup>
      )}
    </div>
  )
}
