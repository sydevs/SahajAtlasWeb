import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateTime, Info } from 'luxon'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/atoms/Checkbox'
import { Dropdown } from '@/components/atoms/Dropdown'
import { Slider } from '@/components/atoms/Slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { DownArrowIcon } from '@/components/atoms/Icons'
import api from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useSearchState } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import {
  type EventCadence,
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
  { value: 'once', key: 'once' },
  { value: 'WEEKLY', key: 'weekly' },
  { value: 'MONTHLY', key: 'monthly' },
]

// A 0–24h value rendered in the active locale's short time format (e.g. "9:30 AM").
// 24 wraps to midnight so the upper bound reads as a time rather than "24:00".
function formatHour(locale: string, hour: number): string {
  const minutes = Math.round(hour * 60) % (24 * 60)

  return DateTime.fromObject({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
    .setLocale(locale)
    .toLocaleString(DateTime.TIME_SIMPLE)
}

// A labelled filter group — a heading (with an optional right-aligned hint, e.g.
// the time readout) above its control.
function FilterGroup({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs text-gray-11">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/**
 * The event-filters form: the Format / Frequency / Day / Time / Language controls,
 * reading and writing the `useSearchState` filter slice. Presentation-only chrome
 * (title, close, "Clear all") lives in its host `FilterView` drawer. Language uses
 * a multi-select dropdown so it scales as more languages appear in the feed; the
 * options are the distinct codes in the cached geojson feed, labelled per locale.
 */
export function SearchFilters() {
  const { t } = useTranslation('common')
  const { locale, languageNames } = useLocale()

  const {
    format,
    timeOfDay,
    daysOfWeek,
    languages,
    cadence,
    setFormat,
    setCadence,
    setTimeOfDay,
    setDaysOfWeek,
    toggleLanguage,
  } = useSearchState()

  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  // Mon-first weekday pills; luxon's `Info.weekdays` is 1 (Mon)–7 (Sun), matching
  // the store's day encoding, so the value is the index + 1.
  const weekdays = useMemo(
    () =>
      Info.weekdays('short', { locale }).map((label, index) => ({
        value: String(index + 1),
        label,
      })),
    [locale],
  )

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

  // Local draft for the time slider so a drag doesn't refetch the list / re-filter
  // the map on every tick — the store is updated only on release (onValueCommit).
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
      <FilterGroup label={t('filters.format.label')}>
        <ToggleGroup
          joined
          ariaLabel={t('filters.format.label')}
          type="single"
          value={format}
          onValueChange={(value) => value && setFormat(value as EventFormat)}
        >
          {FORMAT_OPTIONS.map((option) => (
            <ToggleGroupItem key={option} value={option}>
              {t(`filters.format.${option}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FilterGroup>

      <FilterGroup label={t('filters.cadence.label')}>
        <ToggleGroup
          joined
          ariaLabel={t('filters.cadence.label')}
          type="single"
          value={cadence}
          onValueChange={(value) => value && setCadence(value as EventCadence)}
        >
          {CADENCE_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {t(`filters.cadence.${option.key}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FilterGroup>

      <FilterGroup label={t('filters.days.label')}>
        <ToggleGroup
          ariaLabel={t('filters.days.label')}
          type="multiple"
          value={daysOfWeek.map(String)}
          onValueChange={(value) => setDaysOfWeek(value.map(Number))}
        >
          {weekdays.map((day) => (
            <ToggleGroupItem key={day.value} value={day.value}>
              {day.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FilterGroup>

      <FilterGroup
        hint={
          timeActive
            ? `${formatHour(locale, timeDraft[0])} – ${formatHour(locale, timeDraft[1])}`
            : t('filters.any_time')
        }
        label={t('filters.time.label')}
      >
        <div className="px-1 pt-1">
          <Slider
            ariaLabel={[t('filters.time.start'), t('filters.time.end')]}
            max={TIME_MAX}
            min={TIME_MIN}
            minStepsBetweenThumbs={1}
            step={TIME_STEP}
            value={timeDraft}
            onValueChange={(value) => setTimeDraft([value[0], value[1]])}
            onValueCommit={(value) => setTimeOfDay([value[0], value[1]])}
          />
        </div>
      </FilterGroup>

      <FilterGroup label={t('filters.language.label')}>
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
                  onCheckedChange={() => toggleLanguage(option.code)}
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
