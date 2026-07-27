import { Suspense, useEffect, useMemo } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ScheduleXCalendar, useNextCalendarApp } from '@schedule-x/react'
import { createViewList, createViewMonthGrid, createViewWeek } from '@schedule-x/calendar'

import '@schedule-x/theme-default/dist/index.css'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import api from '@/config/api'
import { useCalendarPosition } from '@/config/store'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useEventFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'
import {
  type EventFilters,
  computeDayBoundaries,
  eventsToCalendarEntries,
  filtersKey,
} from '@/lib/shape'
import { CloseButton, DrawerLoading, DrawerTitle, FilterButton } from '@/views/shared'

// Schedule-X validates `locale` against its own supported BCP-47 set and THROWS
// (`InvalidLocaleError`) on an unknown code — our short `en`/`de`/… crash it. Map our
// locales to the closest one SX 2.36 ships; anything unmapped (incl. Hungarian, which
// SX lacks) falls back to en-US chrome — our own header title stays localized via i18n.
const SX_LOCALES: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  cs: 'cs-CZ',
  nl: 'nl-NL',
  ru: 'ru-RU',
  uk: 'uk-UA',
  'pt-BR': 'pt-BR',
}

const toScheduleXLocale = (locale: string): string => SX_LOCALES[locale] ?? 'en-US'

// Schedule-X 2.36 has no public view-change callback, so we read the live view from the
// app instance's internal `$app.calendarState.view` — a preact signal we subscribe to
// (fires immediately + on every change). Typed defensively: if SX reshapes its internals
// the optional chain yields undefined and the view simply falls back to the default.
type ViewSignal = { subscribe: (fn: (view: string) => void) => () => void }
const viewSignalOf = (app: unknown): ViewSignal | undefined =>
  (app as { $app?: { calendarState?: { view?: ViewSignal } } } | null)?.$app?.calendarState?.view

// The full-width calendar (route `/calendar`, optionally `?region=<slug>`). Its entries
// are the filtered feed (`getCalendarEvents`) expanded into one per upcoming occurrence
// — timezone-correct, online events included — on a Schedule-X month / week / list(agenda)
// grid whose `--sx-*` tokens are mapped to our theme (see globals.css). Placeless, so it
// never frames the map; clicking an entry opens its EventView. The header mirrors
// SearchView (Filter + Close); the Filter button opens FilterView as a right/bottom
// overlay over this (still-mounted) view (see DrawerStack).
//
// The grid captures Schedule-X's config once, so it's split out and KEYED by the applied
// filters: opening the filter overlay doesn't change the filters (the grid stays put), but
// applying remounts CalendarGrid with fresh events + dayBoundaries. The header stays, and a
// local Suspense keeps it visible while the new grid's (cache-once) source resolves. Across
// that remount (and returning from an event) the view + focused date are restored from
// `useCalendarPosition` so the calendar doesn't snap back to the month grid on today.
export function CalendarView() {
  const { t } = useTranslation('common')
  const filters = useEventFilters()

  return (
    <>
      <DrawerHeader className="max-w-none justify-between">
        <DrawerTitle title={t('calendar.title')} />
        {/* Filter + Close as one right-aligned group, matching SearchView. */}
        <div className="flex shrink-0 items-center gap-2">
          <FilterButton />
          <CloseButton />
        </div>
      </DrawerHeader>
      <Suspense fallback={<DrawerLoading />}>
        <CalendarGrid key={filtersKey(filters)} filters={filters} />
      </Suspense>
    </>
  )
}

function CalendarGrid({ filters }: { filters: EventFilters }) {
  const { locale } = useLocale()
  const { theme } = useTheme()
  const navigate = useAtlasNavigate()

  const { data: source } = useSuspenseQuery({
    queryKey: ['calendar', filtersKey(filters), locale],
    queryFn: () => api.getCalendarEvents(filters),
  })

  const events = useMemo(() => eventsToCalendarEntries(source, filters), [source, filters])
  // Frame the week/day grid to the selected time-of-day periods, or (unfiltered) to the
  // events themselves — 1 h either side of the earliest/latest occurrence.
  const dayBoundaries = useMemo(
    () => computeDayBoundaries(events, filters.timeOfDay),
    [events, filters.timeOfDay],
  )

  const monthGrid = createViewMonthGrid()
  // Seed from the last position (view + focused date). Read once, non-reactively, for the
  // capture-config-once hook; it's kept current by the callback + subscription below, so at
  // the next remount (a filter apply captures config during *render*, before this grid
  // unmounts) the seed is already up to date. Nulls fall back to the month grid on today.
  const position = useCalendarPosition.getState()

  const calendar = useNextCalendarApp({
    views: [monthGrid, createViewWeek(), createViewList()],
    // Restore the last view (month by default).
    defaultView: position.view ?? monthGrid.name,
    selectedDate: position.date ?? undefined,
    events,
    // Undefined leaves Schedule-X's default grid (whole day).
    dayBoundaries,
    isDark: theme === 'dark',
    // SX needs a supported BCP-47 code (see SX_LOCALES) or it throws; our token overrides
    // (globals.css) carry the light/dark + accent theming regardless of `isDark`.
    locale: toScheduleXLocale(locale),
    callbacks: {
      // Each entry carries its event's route; open the matching EventView (the atlas
      // navigate stamps camera/depth like every other in-widget push).
      onEventClick: (event) => {
        if (typeof event.path === 'string') navigate(event.path)
      },
      // Persist the focused date as the user pages through the calendar.
      onSelectedDateUpdate: (date) => useCalendarPosition.getState().setDate(date),
    },
  })

  // Persist the current view continuously (SX exposes no callback for it — see viewSignalOf).
  // `calendar` is null until useNextCalendarApp's mount effect resolves, so re-subscribe when
  // it becomes the instance; subscribe fires immediately then on each view switch.
  useEffect(() => {
    const view = viewSignalOf(calendar)

    return view?.subscribe((next) => {
      if (next) useCalendarPosition.getState().setView(next)
    })
  }, [calendar])

  return (
    <DrawerBody className="max-w-none overflow-hidden p-0">
      <div className="sx-calendar">
        <ScheduleXCalendar calendarApp={calendar} />
      </div>
    </DrawerBody>
  )
}
