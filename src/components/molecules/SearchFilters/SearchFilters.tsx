import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info } from 'luxon'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/atoms/Checkbox'
import { Dropdown } from '@/components/atoms/Dropdown'
import { Slider } from '@/components/atoms/Slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { DownArrowIcon } from '@/components/atoms/Icons'
import api from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useLocale } from '@/hooks/use-locale'
import { formatHour } from '@/lib'
import {
  type EventCadence,
  type EventFilters,
  type EventFormat,
  TIME_MAX,
  TIME_MIN,
  TIME_STEP,
  isTimeRestricted,
} from '@/lib/shape'

// The Format toggle options, in display order — the `eventType` values plus `any`.
const FORMAT_OPTIONS: EventFormat[] = ['any', 'offline', 'online']

// The Frequency toggle options; the i18n leaf keys are lowercased (`recurrenceType`
// is upper-case on the wire).
const CADENCE_OPTIONS: { value: EventCadence; key: string }[] = [
  { value: 'any', key: 'any' },
  { value: 'DAILY', key: 'daily' },
  { value: 'WEEKLY', key: 'weekly' },
  { value: 'MONTHLY', key: 'monthly' },
  { value: 'once', key: 'once' },
]

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
  const { locale, languageNames } = useLocale()
  const { format, timeOfDay, daysOfWeek, languages, cadence } = value

  // Patch one or more fields of the current draft.
  const patch = (next: Partial<EventFilters>) => onChange({ ...value, ...next })

  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

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

    const labelOf = (code: string) => {
      try {
        return languageNames.of(code) ?? code
      } catch {
        return code
      }
    }

    return [...codes]
      .map((code) => ({ code, label: labelOf(code) }))
      .sort((a, b) => a.label.localeCompare(b.label, locale))
  }, [geojson, languageNames, locale])

  // Local draft for the time slider so a drag doesn't fire onChange on every tick —
  // the draft is patched only on release (onValueCommit).
  const [timeDraft, setTimeDraft] = useState(timeOfDay)

  useEffect(() => setTimeDraft(timeOfDay), [timeOfDay])

  const timeActive = isTimeRestricted(timeDraft)
  // Show the selected language names in the trigger (truncated) so the selection is
  // visible at a glance, rather than an opaque count.
  const selectedLanguages = languages.map(
    (code) => languageOptions.find((option) => option.code === code)?.label ?? code,
  )
  const languageLabel =
    selectedLanguages.length === 0 ? t('filters.language.all') : selectedLanguages.join(', ')

  return (
    <div className="flex flex-col gap-5">
      <FilterGroup
        active={format !== 'any'}
        label={t('filters.format.label')}
        onClear={() => patch({ format: 'any' })}
      >
        <ToggleGroup
          joined
          ariaLabel={t('filters.format.label')}
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
          ariaLabel={t('filters.cadence.label')}
          type="single"
          value={cadence}
          onValueChange={(next) => next && patch({ cadence: next as EventCadence })}
        >
          {CADENCE_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {t(`filters.cadence.${option.key}`)}
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
          ariaLabel={t('filters.days.label')}
          type="multiple"
          value={daysOfWeek.map(String)}
          onValueChange={(next) => patch({ daysOfWeek: next.map(Number) })}
        >
          {weekdays.map((day) => (
            <ToggleGroupItem key={day.value} ariaLabel={day.full} value={day.value}>
              {day.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FilterGroup>

      <FilterGroup
        active={timeActive}
        hint={
          timeActive
            ? `${formatHour(locale, timeDraft[0])} – ${formatHour(locale, timeDraft[1])}`
            : t('filters.any_time')
        }
        label={t('filters.time.label')}
        onClear={() => patch({ timeOfDay: [TIME_MIN, TIME_MAX] })}
      >
        <div className="px-1 pt-1">
          <Slider
            ariaLabel={[t('filters.time.start'), t('filters.time.end')]}
            max={TIME_MAX}
            min={TIME_MIN}
            minStepsBetweenThumbs={1}
            step={TIME_STEP}
            value={timeDraft}
            onValueChange={(next) => setTimeDraft([next[0], next[1]])}
            onValueCommit={(next) => patch({ timeOfDay: [next[0], next[1]] })}
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
            ariaLabel={t('filters.language.label')}
            role="dialog"
            trigger={
              <span className="inline-flex h-10 w-full items-center justify-between gap-2 rounded border border-gray-7 bg-background px-3 text-sm text-foreground">
                <span className="truncate">{languageLabel}</span>
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
    </div>
  )
}
