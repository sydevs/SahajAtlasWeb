import { type MutableRefObject, Suspense, useEffect, useMemo, useRef } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'
import { ScheduleXCalendar, useNextCalendarApp } from '@schedule-x/react'
import { createViewList, createViewMonthGrid, createViewWeek } from '@schedule-x/calendar'
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls'

import '@schedule-x/theme-default/dist/index.css'

import { Button } from '@/components/atoms/Button'
import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { RightArrowIcon } from '@/components/atoms/Icons'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
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
// SX lacks) falls back to en-US chrome — our own header is fully localized via i18n.
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

// The registered Schedule-X view names — the picker's values and what we persist/restore.
const VIEW_MONTH = 'month-grid'
const VIEW_WEEK = 'week'
const VIEW_LIST = 'list'

type CalendarControls = ReturnType<typeof createCalendarControlsPlugin>

// We DRIVE Schedule-X from our own header rather than styling its built-in one (whose date
// picker / view dropdown / nav we kept fighting): the `calendar-controls` plugin is a public
// API (`setView`/`setDate`/`getRange`/…), so the header is built from our own atoms — one
// consistent drawer header — and SX's header bar is hidden in globals.css.
function CalendarControls({
  controlsRef,
}: {
  controlsRef: MutableRefObject<CalendarControls | null>
}) {
  const { t } = useTranslation('common')
  const { locale } = useLocale()
  const view = useCalendarPosition((s) => s.view) ?? VIEW_MONTH
  const date = useCalendarPosition((s) => s.date)

  // The focused month + year, localized straight from luxon (no per-month i18n key needed).
  const iso = date ?? DateTime.now().toISODate()
  const label = iso
    ? DateTime.fromISO(iso).setLocale(locale).toLocaleString({ month: 'long', year: 'numeric' })
    : ''

  const selectView = (next: string) => {
    if (!next) return
    controlsRef.current?.setView(next)
    useCalendarPosition.getState().setView(next)
  }

  // Page one period by anchoring off the current visible range's edge — view-agnostic, so the
  // same handler moves a month, a week, or the list window.
  const step = (dir: -1 | 1) => {
    const controls = controlsRef.current
    const range = controls?.getRange()

    if (!controls || !range) return

    const to = DateTime.fromISO(dir === 1 ? range.end : range.start)
      .plus({ days: dir })
      .toISODate()

    if (to) controls.setDate(to)
  }

  const goToday = () => {
    const today = DateTime.now().toISODate()

    if (today) controlsRef.current?.setDate(today)
  }

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <DrawerTitle title={t('calendar.title')} />
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            isIconOnly
            aria-label={t('calendar.previous')}
            size="sm"
            variant="ghost"
            onClick={() => step(-1)}
          >
            <RightArrowIcon className="h-4 w-4 rotate-180" />
          </Button>
          <Button size="sm" variant="ghost" onClick={goToday}>
            {t('calendar.today')}
          </Button>
          <Button
            isIconOnly
            aria-label={t('calendar.next')}
            size="sm"
            variant="ghost"
            onClick={() => step(1)}
          >
            <RightArrowIcon className="h-4 w-4" />
          </Button>
        </div>
        <span className="truncate text-sm font-medium">{label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ToggleGroup
          joined
          aria-label={t('calendar.title')}
          type="single"
          value={view}
          onValueChange={selectView}
        >
          <ToggleGroupItem value={VIEW_MONTH}>{t('calendar.views.month')}</ToggleGroupItem>
          <ToggleGroupItem value={VIEW_WEEK}>{t('calendar.views.week')}</ToggleGroupItem>
          <ToggleGroupItem value={VIEW_LIST}>{t('calendar.views.list')}</ToggleGroupItem>
        </ToggleGroup>
        <FilterButton />
        <CloseButton />
      </div>
    </>
  )
}

// The full-width calendar (route `/calendar`, optionally `?region=<slug>`). Its entries
// are the filtered feed (`getCalendarEvents`) expanded into one per upcoming occurrence
// — timezone-correct, online events included — on a Schedule-X month / week / list(agenda)
// grid whose `--sx-*` tokens are mapped to our theme (see globals.css). Placeless, so it
// never frames the map; clicking an entry opens its EventView. The Filter button opens
// FilterView as a right/bottom overlay over this (still-mounted) view (see DrawerStack).
//
// Our own header (CalendarControls) drives the calendar via the calendar-controls plugin, so
// SX's built-in header is hidden — one consistent drawer header for every width, no merge. The
// grid is KEYED by the applied filters so it captures Schedule-X's config once and remounts
// with fresh events + dayBoundaries on apply; a local Suspense keeps the drawer filled while
// the (cache-once) source resolves. Across that remount (and returning from an event) the view
// + focused date are restored from `useCalendarPosition` (seeded here, updated by the header +
// the `onSelectedDateUpdate` callback).
export function CalendarView() {
  const filters = useEventFilters()
  // The plugin lives with the grid (below the Suspense); the header, rendered above it, reaches
  // it through this ref (null until the grid mounts — its buttons no-op during the brief load).
  const controlsRef = useRef<CalendarControls | null>(null)

  return (
    <>
      <DrawerHeader className="max-w-none flex-wrap justify-between gap-x-3 gap-y-2">
        <CalendarControls controlsRef={controlsRef} />
      </DrawerHeader>
      <Suspense fallback={<DrawerLoading />}>
        <CalendarGrid key={filtersKey(filters)} controlsRef={controlsRef} filters={filters} />
      </Suspense>
    </>
  )
}

function CalendarGrid({
  filters,
  controlsRef,
}: {
  filters: EventFilters
  controlsRef: MutableRefObject<CalendarControls | null>
}) {
  // The "Online" term is the SAME one the list/detail views show for an online event's
  // location (`events:display.online`) — no calendar-specific duplicate.
  const { t } = useTranslation('events')
  const { locale } = useLocale()
  const { theme } = useTheme()
  const navigate = useAtlasNavigate()

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
  // The public control surface our header drives (setView/setDate/getRange). Created per mount
  // (stable within it) and exposed to the header via the ref effect below.
  const controls = useMemo(() => createCalendarControlsPlugin(), [])
  // Seed from the last position (view + focused date). Read once, non-reactively, for the
  // capture-config-once hook; kept current by the header + the callback below, so at the next
  // remount (a filter apply captures config during *render*) the seed is already up to date.
  const position = useCalendarPosition.getState()

  const calendar = useNextCalendarApp(
    {
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
        // Persist the focused date as the user pages through the calendar (drives the header label).
        onSelectedDateUpdate: (date) => useCalendarPosition.getState().setDate(date),
        // The month grid's "+N more" jumps to the list view focused on that day.
        onClickPlusEvents: (date) => {
          controls.setDate(date)
          controls.setView(VIEW_LIST)
          useCalendarPosition.getState().setDate(date)
          useCalendarPosition.getState().setView(VIEW_LIST)
        },
      },
      weekOptions: {
        eventWidth: 98,
      },
    },
    [controls],
  )

  // Publish the controls to the header (rendered above this grid) for the lifetime of the mount.
  useEffect(() => {
    controlsRef.current = controls

    return () => {
      controlsRef.current = null
    }
  }, [controls, controlsRef])

  return (
    <DrawerBody className="max-w-none overflow-hidden p-4">
      <div className="sx-calendar">
        <ScheduleXCalendar calendarApp={calendar} />
      </div>
    </DrawerBody>
  )
}
