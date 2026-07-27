import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
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

// Online programs get their own colour (the secondary ramp) so they stand out from in-person
// events on the grid; entries built with `calendarId: 'online'` (see eventsToCalendarEntries)
// pick it up. Light + dark share the same token strings — our `--secondary-*` CSS vars adapt
// to the theme on the `.sx-calendar` wrapper, so SX's own isDark colour switch isn't needed.
const ONLINE_COLORS = {
  main: 'hsl(var(--secondary-9))',
  container: 'hsl(var(--secondary-4))',
  onContainer: 'hsl(var(--secondary-11))',
}
const CALENDARS = {
  online: { colorName: 'online', lightColors: ONLINE_COLORS, darkColors: ONLINE_COLORS },
}

// Schedule-X 2.36 has no public view-change callback, so we read the live view from the
// app instance's internal `$app.calendarState.view` — a preact signal we subscribe to
// (fires immediately + on every change). Typed defensively: if SX reshapes its internals
// the optional chain yields undefined and the view simply falls back to the default.
type ViewSignal = { subscribe: (fn: (view: string) => void) => () => void }
const viewSignalOf = (app: unknown): ViewSignal | undefined =>
  (app as { $app?: { calendarState?: { view?: ViewSignal } } } | null)?.$app?.calendarState?.view

// SX 2.36 has no public `setView`, so we reach the internal `calendarState.setView(view, date)`
// (defensively, like viewSignalOf) to drive the month grid's "+N more" into the list view.
type CalendarStateApi = { setView: (view: string, date: string) => void }
const calendarStateOf = (app: unknown): CalendarStateApi | undefined =>
  (app as { $app?: { calendarState?: CalendarStateApi } } | null)?.$app?.calendarState

// Minimum calendar width (px) to merge our controls into Schedule-X's header row; below it we
// keep the stacked DrawerHeader. Measured on the container, not the viewport (see CalendarView).
const MERGE_MIN_WIDTH = 768

// ── Merged header (wide grids only) ──
// On a wide month/week grid we render our title + Filter/Close INTO Schedule-X's own header bar
// (`customComponents`) so the two headers collapse into one row. SX portals these from our React
// tree, so they keep Router / i18n / drawer (`useDrawerControl`) context and behave exactly like
// the old header controls. (On a narrow calendar or the list view we fall back to a separate
// stacked DrawerHeader — see CalendarView — so this row can't get crowded.)
function CalendarHeaderTitle() {
  const { t } = useTranslation('common')

  return <h2 className="self-center truncate text-lg font-semibold">{t('calendar.title')}</h2>
}

function CalendarHeaderActions() {
  return (
    <div className="flex shrink-0 items-center gap-2 self-center">
      <FilterButton />
      <CloseButton />
    </div>
  )
}

// A stable (module-level) map so the React adapter doesn't re-register the slots each render.
const CALENDAR_HEADER = {
  headerContentLeftPrepend: CalendarHeaderTitle,
  headerContentRightAppend: CalendarHeaderActions,
}

// The full-width calendar (route `/calendar`, optionally `?region=<slug>`). Its entries
// are the filtered feed (`getCalendarEvents`) expanded into one per upcoming occurrence
// — timezone-correct, online events included — on a Schedule-X month / week / day / list(agenda)
// grid whose `--sx-*` tokens are mapped to our theme (see globals.css). Placeless, so it
// never frames the map; clicking an entry opens its EventView. The Filter button opens
// FilterView as a right/bottom overlay over this (still-mounted) view (see DrawerStack).
//
// Header layout is responsive to the calendar's OWN width (measured, so it's right in embeds
// too — a wide host page with a narrow widget slot would fool a viewport media query): on a
// wide month/week grid the title + Filter/Close merge INTO Schedule-X's header bar (one row,
// see CALENDAR_HEADER); on a narrow calendar OR the single-column list view we keep a separate
// DrawerHeader stacked above SX's own header, so a header always shows. The grid is KEYED by the
// applied filters AND that `merged` flag, so it captures Schedule-X's config (incl. the header
// slots) once and cleanly re-registers on a flip; a local Suspense keeps the drawer filled while
// the (cache-once) source resolves, and across a remount (and returning from an event) the view
// + focused date are restored from `useCalendarPosition`.
export function CalendarView() {
  const { t } = useTranslation('common')
  const filters = useEventFilters()
  // Read the view reactively so a month↔list switch re-lays out the header (DrawerStack reads the
  // same value to resize the drawer). Merge only when the calendar itself is wide enough for one
  // roomy row — below the threshold, or in the list view, stay stacked. Defaults to stacked until
  // measured (the safe direction: a header always shows).
  const view = useCalendarPosition((s) => s.view)
  const containerRef = useRef<HTMLDivElement>(null)
  const [wideEnough, setWideEnough] = useState(false)

  useEffect(() => {
    const el = containerRef.current

    if (!el) return

    const observer = new ResizeObserver((entries) => {
      setWideEnough(entries[0].contentRect.width >= MERGE_MIN_WIDTH)
    })

    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  const merged = wideEnough && view !== 'list'

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      {!merged && (
        <DrawerHeader className="max-w-none justify-between">
          <DrawerTitle title={t('calendar.title')} />
          {/* Filter + Close as one right-aligned group, matching SearchView. */}
          <div className="flex shrink-0 items-center gap-2">
            <FilterButton />
            <CloseButton />
          </div>
        </DrawerHeader>
      )}
      <Suspense fallback={<DrawerLoading />}>
        <CalendarGrid key={`${filtersKey(filters)}:${merged}`} filters={filters} merged={merged} />
      </Suspense>
    </div>
  )
}

function CalendarGrid({ filters, merged }: { filters: EventFilters; merged: boolean }) {
  // The "Online" term is the SAME one the list/detail views show for an online event's
  // location (`events:display.online`) — no calendar-specific duplicate.
  const { t } = useTranslation('events')
  const { locale } = useLocale()
  const { theme } = useTheme()
  const navigate = useAtlasNavigate()
  // Holds the live calendar app for callbacks captured before it exists (kept current in the
  // effect below) — the "+N more" handler needs it to switch views.
  const calendarRef = useRef<unknown>(null)

  const { data: source } = useSuspenseQuery({
    queryKey: ['calendar', filtersKey(filters), locale],
    queryFn: () => api.getCalendarEvents(filters),
  })

  const onlineLabel = t('display.online')
  const events = useMemo(
    () => eventsToCalendarEntries(source, filters, { onlineLabel }),
    [source, filters, onlineLabel],
  )
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
    // Online programs render in the secondary colour (see CALENDARS + `calendarId`).
    calendars: CALENDARS,
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
      // The month grid's "+N more" jumps to the list view focused on that day (rather than a
      // separate Day view), so every event for the day is visible in one place.
      onClickPlusEvents: (date) => calendarStateOf(calendarRef.current)?.setView('list', date),
    },
    weekOptions: {
      eventWidth: 98,
    },
  })

  // Persist the current view continuously (SX exposes no callback for it — see viewSignalOf).
  // `calendar` is null until useNextCalendarApp's mount effect resolves, so re-subscribe when
  // it becomes the instance; subscribe fires immediately then on each view switch.
  useEffect(() => {
    calendarRef.current = calendar
    const view = viewSignalOf(calendar)

    return view?.subscribe((next) => {
      if (next) useCalendarPosition.getState().setView(next)
    })
  }, [calendar])

  return (
    <DrawerBody className="max-w-none overflow-hidden p-4">
      <div className="sx-calendar">
        {/* Merge our controls into SX's header only on a wide grid (see CalendarView). */}
        <ScheduleXCalendar
          calendarApp={calendar}
          customComponents={merged ? CALENDAR_HEADER : undefined}
        />
      </div>
    </DrawerBody>
  )
}
