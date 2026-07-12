import {
  type ComponentProps,
  type ReactNode,
  forwardRef,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from '@floating-ui/react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { DateTime, Info } from 'luxon'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { Checkbox } from '@/components/atoms/Checkbox'
import { IconButton } from '@/components/atoms/Button'
import { Slider } from '@/components/atoms/Slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { FilterIcon } from '@/components/atoms/Icons'
import api from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useIsDesktop } from '@/config/responsive'
import { useSearchState } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { overlayContainer } from '@/lib/overlay'
import {
  type EventCadence,
  type EventFormat,
  TIME_MAX,
  TIME_MIN,
  TIME_STEP,
  activeFilterCount,
  hasActiveFilters,
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

/**
 * The event-filters control: a header IconButton (with an active-filter count
 * badge) that opens the filter panel. On desktop the panel is a floating popover
 * anchored to the button; below `md` it is a bottom-sheet dialog with more room.
 * Both render the same `FilterPanel`, which reads and writes `useSearchState`.
 */
export function SearchFilters() {
  const isDesktop = useIsDesktop()

  // Two implementations, one per breakpoint — each owns its own open state and
  // popover/dialog hooks, so crossing `md` cleanly swaps them.
  return isDesktop ? <DesktopFilters /> : <MobileFilters />
}

// The trigger button, shared by both breakpoints. forwardRef so it can be the
// floating-ui reference (desktop) or a Radix `Dialog.Trigger asChild` (mobile) —
// in both cases the IconButton itself is the real, single trigger button.
const FilterTrigger = forwardRef<HTMLButtonElement, ComponentProps<'button'>>(
  function FilterTrigger(props, ref) {
    const { t } = useTranslation('common')
    const count = useSearchState((state) => activeFilterCount(state))

    // Fold the active count into the accessible name so assistive tech knows
    // filters are active (the badge itself is decorative / aria-hidden).
    const label = count > 0 ? `${t('filters.title')} (${count})` : t('filters.title')

    return (
      <IconButton ref={ref} aria-label={label} className="relative" {...props}>
        <FilterIcon size={20} />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-9 px-1 text-[10px] font-semibold leading-none text-primary-foreground"
          >
            {count}
          </span>
        )}
      </IconButton>
    )
  },
)

function DesktopFilters() {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'dialog' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  return (
    <>
      <FilterTrigger ref={refs.setReference} {...getReferenceProps()} />
      {open && (
        <FloatingPortal root={overlayContainer()}>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              className="z-50 flex max-h-[32rem] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-gray-6 bg-gray-2 shadow-xl"
              style={floatingStyles}
              {...getFloatingProps({ 'aria-label': t('filters.title') })}
            >
              <FilterPanel />
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}

function MobileFilters() {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <FilterTrigger />
      </Dialog.Trigger>
      <Dialog.Portal container={overlayContainer()}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-gray-6 bg-gray-2 shadow-xl focus:outline-none"
        >
          <Dialog.Title className="sr-only">{t('filters.title')}</Dialog.Title>
          <FilterPanel />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
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

// The panel body, shared by the popover and the bottom-sheet. Reads/writes the
// filter slice of `useSearchState`; language options come from the cached geojson
// feed (the map's `['geojson']` query), labelled in the active locale.
function FilterPanel() {
  const { t } = useTranslation('common')
  const { locale, languageNames } = useLocale()

  // FilterPanel consumes every field + setter, so it subscribes to the whole
  // (filter-only) store rather than projecting a redundant identical slice.
  const store = useSearchState()
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
    clearFilters,
  } = store

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
  const active = hasActiveFilters(store)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-6 px-4 py-3">
        <p className="text-base font-semibold text-foreground">{t('filters.title')}</p>
        {active && (
          <Button color="primary" size="sm" variant="light" onClick={clearFilters}>
            {t('filters.clear')}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-5 overflow-y-auto px-4 py-4">
        <FilterGroup label={t('filters.format.label')}>
          <ToggleGroup
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
            <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
              {languageOptions.map((option) => (
                <Checkbox
                  key={option.code}
                  appearance="checkbox"
                  checked={languages.includes(option.code)}
                  onCheckedChange={() => toggleLanguage(option.code)}
                >
                  {option.label}
                </Checkbox>
              ))}
            </div>
          )}
        </FilterGroup>
      </div>
    </div>
  )
}
