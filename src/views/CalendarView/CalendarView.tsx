import { Suspense, useMemo, useRef, useState } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'
import { useNextCalendarApp } from '@schedule-x/react'
import { createViewMonthAgenda, createViewMonthGrid, createViewWeek } from '@schedule-x/calendar'
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls'
import { Check, ChevronRight, Share } from 'lucide-react'

import '@schedule-x/theme-default/dist/index.css'

import { type CalendarRenderers, CalendarMount } from './CalendarMount'
import { TimesNote } from './TimesNote'
import { WeekList } from './WeekList'

import { Button } from '@/components/atoms/Button'
import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { ActiveFilterPills, ResetErrorBoundary } from '@/components/molecules'
import { calendarQuery, regionQuery, regionsQuery } from '@/config/api'
import { useIsWideWidget } from '@/config/responsive'
import { useHrefFor } from '@/config/routing'
import { useCalendarPosition } from '@/config/store'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useCalendarView, useSetCalendarView } from '@/hooks/use-calendar-view'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWebShare } from '@/hooks/use-web-share'
import { useTheme } from '@/hooks/use-theme'
import {
  CALENDAR_VIEW_LIST,
  CALENDAR_VIEW_MONTH,
  CALENDAR_VIEW_WEEK,
  type EventFilters,
  calendarShareRoute,
  calendarWindow,
  chosenCalendarFilters,
  computeDayBoundaries,
  eventsToCalendarEntries,
  filtersKey,
  isCalendarViewOption,
  isDateRestricted,
  resolveCalendarView,
  shiftCalendarWindow,
  todayISO,
  weekFrom,
} from '@/lib/shape'
import { CloseButton, DrawerTitle, FilterButton, useFrameOnTop } from '@/views/shared'
import { DrawerErrorBody, DrawerLoadingBody } from '@/views/fallbacks'

// Schedule-X validates `locale` against its own supported BCP-47 set, and THROWS
// (`InvalidLocaleError`) on an unknown code — this project's short `en`/`de`/… crash it. This
// maps this project's locales to the closest one SX 2.36 ships. Anything unmapped, including
// Hungarian, which SX lacks, falls back to en-US chrome. This project's own header stays fully
// localized via i18n.
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

const SX_ENGLISH = {
  '+ {{n}} events': '+ {{n}} classes',
  '+ 1 event': '+ 1 class',
  'No events': 'No classes',
}

const toScheduleXLocale = (locale: string): string => SX_LOCALES[locale] ?? 'en-US'

// Online programs get their own colour, the secondary ramp, so they stand out from
// in-person events on the grid. Entries built with `calendarId: 'online'` (see
// eventsToCalendarEntries) pick it up. Light and dark share the same token strings — the
// `--secondary-*` CSS vars adapt to the theme on the `.sx-calendar` wrapper, so SX's own
// isDark colour switch is not needed.
const ONLINE_COLORS = {
  main: 'hsl(var(--secondary-9))',
  container: 'hsl(var(--secondary-4))',
  onContainer: 'var(--gray-12)',
}
const CALENDARS = {
  online: { colorName: 'online', lightColors: ONLINE_COLORS, darkColors: ONLINE_COLORS },
}

// Plain DOM, since Schedule-X hands these an element rather than rendering a component.
const calendarRenderers = (locale: string): CalendarRenderers => {
  const time = (wallClock: string) =>
    DateTime.fromFormat(wallClock, 'yyyy-MM-dd HH:mm')
      .setLocale(locale)
      .toLocaleString(DateTime.TIME_SIMPLE)
  const div = (className: string, text: string) => {
    const element = document.createElement('div')

    element.className = className
    element.textContent = text

    return element
  }

  return {
    // The phone Month row: the class name, then its time and place. Schedule-X's own row
    // repeats the date the visitor just tapped.
    monthAgendaEvent: (host, entry) => {
      const hours = `${time(entry.start)} – ${time(entry.end)}`

      host.replaceChildren(
        div('sx-entry-name', entry.name ?? ''),
        div('sx-entry-meta', [hours, entry.detail].filter(Boolean).join(' · ')),
      )
    },
    // The desktop Month cell is about 150px after the time. There, class names cut to a column
    // of identical "Evening Meditation", so the cell says where and the tooltip says what.
    monthGridEvent: (host, entry) => {
      const where = [entry.place, entry.location].filter(Boolean).join(' · ') || entry.name
      const cell = div('sx-entry-cell', `${time(entry.start)} ${where ?? ''}`)

      cell.title = [entry.name, entry.detail].filter(Boolean).join(' · ')
      cell.dataset.online = String(entry.calendarId === 'online')
      host.replaceChildren(cell)
    },
    // A one-hour Week entry has room for three short lines. Its position already shows how long it
    // lasts, so it gives the start and where, then the name, and never a clipped fourth line.
    timeGridEvent: (host, entry) => {
      const where = entry.location ?? entry.place

      const block = div('sx-entry-week', '')

      block.dataset.online = String(entry.calendarId === 'online')
      block.append(
        div('sx-entry-week-meta', [time(entry.start), where].filter(Boolean).join(' · ')),
        div('sx-entry-week-name', entry.name ?? ''),
      )
      host.replaceChildren(block)
    },
  }
}

type CalendarControlsPlugin = ReturnType<typeof createCalendarControlsPlugin>

// The header drives Schedule-X through the `calendar-controls` plugin, but its buttons are
// live before the grid mounts — the header sits above the Suspense. So each action updates the
// store FIRST. That is what re-renders the header — label and active view — and what the grid
// seeds from when it (re)mounts. It then best-effort calls the plugin to move the *mounted*
// calendar. This call is wrapped because a plugin call before its `onRender` throws a
// TypeError, since there is no `$app` yet. The store write above already recorded the intent,
// and the seed applies it on mount.
const drive = (controls: CalendarControlsPlugin, fn: (c: CalendarControlsPlugin) => void) => {
  try {
    fn(controls)
  } catch {
    // Pre-mount: the plugin has no `$app` yet — the store write above seeds it on mount.
  }
}

// Shares the dates on screen, with the scope and filters that were applied. The dates are written
// into the link even when the visitor is looking at the next seven days, because a link sent today
// should still mean those days when it is opened next Tuesday. A phone opens its own share sheet;
// anywhere else, or when that is blocked or dismissed, the link is copied. The button keeps its
// size when it confirms, so the header doesn't move.
function ShareDates({ start, end, label }: { start: string; end: string; label: string }) {
  const { t } = useTranslation()
  const hrefFor = useHrefFor()
  const { share } = useWebShare()
  const [copied, setCopied] = useState(false)
  const [searchParams] = useSearchParams()

  // Memory-routed embeds have no address to link to, so there is nothing to offer.
  if (!hrefFor) return null

  const onShare = async () => {
    const url = hrefFor(calendarShareRoute(searchParams, start, end))

    if (await share({ title: t('calendar.share_title', { dates: label }), url })) return

    await navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      globalThis.setTimeout(() => setCopied(false), 2000)
    })
  }
  const name = copied ? t('calendar.link_copied') : t('event.actions.share')

  return (
    <Button isIconOnly aria-label={name} size="sm" title={name} variant="ghost" onClick={onShare}>
      {copied ? <Check className="text-primary-11" size={20} /> : <Share size={20} />}
      <span aria-live="polite" className="sr-only">
        {copied ? name : ''}
      </span>
    </Button>
  )
}

// This drives Schedule-X from this project's own header, rather than styling its built-in
// one, whose date picker, view dropdown, and nav kept causing conflicts. The `calendar-controls`
// plugin is a public API (`setView`/`setDate`/`getRange`/…), so the header uses this project's
// own atoms — one consistent drawer header — and SX's header bar stays hidden in globals.css.
function CalendarControls({ controls }: { controls: CalendarControlsPlugin }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const isWide = useIsWideWidget()
  const stored = useCalendarView()
  const setCalendarView = useSetCalendarView()
  const filters = useEventFilters()
  const { setDateRange } = useSetFilters()
  const { data: regions } = useQuery(regionsQuery())
  const place = regions?.find((node) => node.slug === filters.region)?.name
  // The OPTION, not the stored name: below the crossing a stored `week` renders a month
  // agenda, so the lit button, the label and the paging step must all follow what rendered.
  const { option } = resolveCalendarView(stored, isWide)
  const date = useCalendarPosition((s) => s.date)
  const dateInputRef = useRef<HTMLInputElement>(null)

  // The focused date (falls back to today until the grid reports one). The header label,
  // localized straight from luxon (no per-month i18n key), shows the month + year in month view,
  // the first day in week view, and the dates on screen in the list.
  const focused = date ?? DateTime.now().toISODate()
  const dt = focused ? DateTime.fromISO(focused).setLocale(locale) : null
  const isList = option === CALENDAR_VIEW_LIST
  const today = todayISO()
  const hasDates = isDateRestricted(filters.dateRange)
  const window = calendarWindow(filters.dateRange, today)
  const windowDates = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).formatRange(DateTime.fromISO(window.start).toJSDate(), DateTime.fromISO(window.end).toJSDate())
  const label = isList
    ? window.isThisWeek
      ? t('calendar.next_7_days')
      : windowDates
    : !dt
      ? ''
      : option === CALENDAR_VIEW_MONTH
        ? dt.toLocaleString({ month: 'long', year: 'numeric' })
        : dt.startOf('week').toLocaleString({ day: 'numeric', month: 'short', year: 'numeric' })

  const applyDate = (next: string) => {
    if (isList) {
      setDateRange(weekFrom(next))

      return
    }

    useCalendarPosition.getState().setDate(next)
    drive(controls, (c) => c.setDate(next))
  }

  // The store takes what was PICKED, never the width-specific view that renders for it, so a
  // `week` picked on a desktop lights Week again after a trip through a phone width.
  const selectView = (next: string) => {
    if (!isCalendarViewOption(next)) return
    // The List's dates are its arrows, not a filter, so they don't follow the visitor to a grid.
    // The grid opens on the first of them instead.
    const leavingPagedList = isList && next !== CALENDAR_VIEW_LIST && hasDates

    if (leavingPagedList) useCalendarPosition.getState().setDate(window.start)
    setCalendarView(next, leavingPagedList ? (params) => params.delete('dates') : undefined)
    drive(controls, (c) => c.setView(resolveCalendarView(next, isWide).view))
  }

  // Page one period: a month in month view, a week in week view, and in the list as many days
  // as are on screen.
  const step = (dir: -1 | 1) => {
    if (isList) {
      setDateRange(shiftCalendarWindow(window, dir, today))

      return
    }
    if (!focused) return

    const base = DateTime.fromISO(focused)
    const next = (
      option === CALENDAR_VIEW_MONTH ? base.plus({ months: dir }) : base.plus({ weeks: dir })
    ).toISODate()

    if (next) applyDate(next)
  }

  return (
    <>
      {/* Where this is, then the same control group as a region's header. */}
      <div className="flex w-full items-center justify-between gap-2">
        <DrawerTitle title={place ?? t('calendar.title')} />
        <div className="flex shrink-0 items-center gap-2">
          {isList && <ShareDates end={window.end} label={windowDates} start={window.start} />}
          <FilterButton iconOnly counted={chosenCalendarFilters(filters, isList)} />
          <CloseButton />
        </div>
      </div>

      {/* Mode picker — first item, so it holds its row when the rest wraps below. */}
      <ToggleGroup
        joined
        aria-label={t('calendar.title')}
        type="single"
        value={option}
        onValueChange={selectView}
      >
        <ToggleGroupItem value={CALENDAR_VIEW_MONTH}>{t('calendar.view_month')}</ToggleGroupItem>
        {/* Schedule-X ships no small-screen week, and a 7-column time grid at 390px was never
            readable — so below the crossing the switch offers Month and List only. */}
        {isWide && (
          <ToggleGroupItem value={CALENDAR_VIEW_WEEK}>{t('calendar.view_week')}</ToggleGroupItem>
        )}
        <ToggleGroupItem value={CALENDAR_VIEW_LIST}>{t('calendar.view_list')}</ToggleGroupItem>
      </ToggleGroup>

      {/* Nav + filter — wraps to a second line on narrow widths, one line on large. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5">
          <Button
            isIconOnly
            aria-label={t('calendar.previous')}
            disabled={isList && window.start <= today}
            size="sm"
            variant="ghost"
            onClick={() => step(-1)}
          >
            <ChevronRight className="h-4 w-4 rotate-180 rtl:-scale-x-100" />
          </Button>

          {/* The focused date sits between the arrows. Clicking it opens the browser's native
              picker, which has its own Today button, so this needs no separate one. The input
              overlays the button so the picker anchors to it, but stays click-through.
              Its `field-size` is insurance, not a live fix: nothing can focus it today, and
              Safari's focus zoom needs focus (#322). Giving an input that can become focusable
              anything under 16px is the defect, so the floor goes on now rather than later. */}
          <div className="relative">
            <button
              className="inline-flex items-center rounded px-1.5 py-1 text-sm font-medium hover:bg-primary-3"
              type="button"
              onClick={() => dateInputRef.current?.showPicker?.()}
            >
              {label}
            </button>
            <input
              ref={dateInputRef}
              aria-label={t('calendar.pick_date')}
              className="pointer-events-none absolute inset-0 h-full w-full field-size opacity-0"
              tabIndex={-1}
              type="date"
              value={isList ? window.start : (focused ?? '')}
              onChange={(event) => event.target.value && applyDate(event.target.value)}
            />
          </div>

          <Button
            isIconOnly
            aria-label={t('calendar.next')}
            size="sm"
            variant="ghost"
            onClick={() => step(1)}
          >
            <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
          </Button>
        </div>
      </div>
    </>
  )
}

// The full-width calendar, at route `/calendar`, optionally with `?region=<slug>`. Its
// entries are the filtered feed (`getCalendarEvents`) expanded into one per upcoming
// occurrence — timezone-correct, online events included — on a Schedule-X month or week grid
// whose `--sx-*` tokens are mapped to this project's theme (see
// globals.css), or on this project's own day-by-day list (`WeekList`). This view is placeless, so it never frames the map. Clicking an entry opens
// its EventView. The Filter button opens FilterView as a right or bottom overlay over this
// still-mounted view (see DrawerStack).
//
// This project's own header (CalendarControls) drives the calendar via the calendar-controls
// plugin, so SX's built-in header stays hidden — one consistent drawer header for every width.
// The plugin is created here and shared with the header. The grid is KEYED by the applied
// filters, so it captures Schedule-X's config once and remounts with fresh events and
// dayBoundaries on apply — the shared plugin re-binds to the new instance. A local Suspense
// keeps the header and pills visible while the cache-once source resolves. Across a remount,
// and when returning from an event, the view and focused date restore from
// `useCalendarPosition`.
// A link opened fresh should show the place it is about, not one cluster on a world map. Arriving
// from inside the widget, the map is already there.
function useFrameScope(slug: string | null) {
  const { locale } = useLocale()
  const { frameRegion } = useMapController()
  const { data: region } = useQuery({ ...regionQuery(slug ?? '', locale), enabled: Boolean(slug) })

  useFrameOnTop(
    ({ isEntry }) => {
      if (region && isEntry) frameRegion(region)
    },
    [region, frameRegion],
  )
}

export function CalendarView() {
  const filters = useEventFilters()
  // Shared with the grid (which registers + binds it) and the header (which drives it). Stable
  // across filter-apply remounts — the grid re-binds the same plugin to each new instance.
  const controls = useMemo(() => createCalendarControlsPlugin(), [])
  const isWide = useIsWideWidget()
  const { option } = resolveCalendarView(useCalendarView(), isWide)

  useFrameScope(filters.region)

  return (
    <>
      <DrawerHeader className="max-w-none flex-wrap items-center gap-x-3 gap-y-2">
        <CalendarControls controls={controls} />
      </DrawerHeader>
      <ActiveFilterPills filters={chosenCalendarFilters(filters, option === CALENDAR_VIEW_LIST)} />
      {/* The grid owns the `['calendar', …]` read. The header above — month nav, view picker,
          filters, close — and the pills read none of it. So a failed grid is survivable in
          place. Escalating it to the drawer boundary would replace all that working chrome to
          show the identical alert (issue #89).
          `resetKeys` is load-bearing, not decoration. `listResetKey` (lib/shape/path.ts)
          explains why the pathname alone is not enough. */}
      <ResetErrorBoundary FallbackComponent={DrawerErrorBody} resetKeys={[filtersKey(filters)]}>
        {/* `DrawerLoadingBody`, not `DrawerLoading` — this fence sits BELOW the header
            above, so the chrome-ful one drew a second header (and a second close button)
            under CalendarControls while the grid loaded. Pairs with `DrawerErrorBody` on
            the boundary, for the same reason. */}
        <Suspense fallback={<DrawerLoadingBody />}>
          {option === CALENDAR_VIEW_LIST ? (
            <WeekList filters={filters} />
          ) : (
            <CalendarGrid key={filtersKey(filters)} controls={controls} filters={filters} />
          )}
        </Suspense>
      </ResetErrorBoundary>
    </>
  )
}

function CalendarGrid({
  filters,
  controls,
}: {
  filters: EventFilters
  controls: CalendarControlsPlugin
}) {
  // The "Online" term is the SAME one the list/detail views show for an online event's
  // location (`events:display.online`) — no calendar-specific duplicate.
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { theme } = useTheme()
  const navigate = useAtlasNavigate()
  const isWide = useIsWideWidget()

  const setCalendarView = useSetCalendarView()
  const { data: source } = useSuspenseQuery(calendarQuery(filters, locale))

  const onlineLabel = t('event.display.online')
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

  // Seed from the last position — view and focused date. This reads once, non-reactively, for
  // the capture-config-once hook. The header and the callback below keep it current, so at the
  // next remount — a filter apply captures config during *render* — the seed is already up to
  // date.
  const position = useCalendarPosition.getState()

  const calendar = useNextCalendarApp(
    {
      // `month-agenda` is registered because `controls.setView` validates the name against this
      // list — the resolver, never Schedule-X, is what chooses it.
      views: [createViewMonthGrid(), createViewMonthAgenda(), createViewWeek()],
      // ⚠ Captured ONCE, so this seam answers a width crossing only because `DrawerStack`
      // remounts the whole drawer when `isWide` flips (vaul's `direction` is not
      // hot-swappable), remounting this grid with it. Should that stop, so does this.
      defaultView: resolveCalendarView(position.view, isWide).view,
      selectedDate: position.date ?? undefined,
      events,
      // Online programs render in the secondary colour (see CALENDARS + `calendarId`).
      calendars: CALENDARS,
      // Undefined leaves Schedule-X's default grid (whole day).
      dayBoundaries,
      isDark: theme === 'dark',
      // ⚠ Otherwise Schedule-X rewrites the rendered view at its own breakpoint and emits no
      // callback, so the switch cannot learn about it — which lit Month over a day list on a
      // phone. `resolveCalendarView` decides instead (#331, `docs/rules/i18n-and-state.md`).
      isResponsive: false,
      // SX needs a supported BCP-47 code (see SX_LOCALES), or it throws. This project's token
      // overrides (globals.css) carry the light/dark and accent theming regardless of
      // `isDark`.
      locale: toScheduleXLocale(locale),
      // Schedule-X's own "+ 12 events" and "No events", in the words a visitor reads here.
      translations: locale === 'en' ? { enUS: SX_ENGLISH } : undefined,
      callbacks: {
        // Each entry carries its event's route. This opens the matching EventView — the atlas
        // navigate stamps camera and depth like every other in-widget push.
        onEventClick: (event) => {
          if (typeof event.path === 'string') navigate(event.path)
        },
        // Persist the focused date as the user pages through the calendar (drives the header label).
        onSelectedDateUpdate: (date) => useCalendarPosition.getState().setDate(date),
        // The month grid's "+N more" opens the list on that one day.
        onClickPlusEvents: (date) =>
          setCalendarView(CALENDAR_VIEW_LIST, (next) => next.set('dates', `${date},${date}`)),
      },
      weekOptions: {
        eventWidth: 98,
      },
    },
    [controls],
  )

  const renderers = useMemo(() => calendarRenderers(locale), [locale])
  const focused = DateTime.fromISO(useCalendarPosition((s) => s.date) ?? todayISO())

  return (
    <>
      <DrawerBody className="max-w-none overflow-hidden px-4 pb-4">
        <div className="sx-calendar">
          <CalendarMount calendar={calendar} renderers={renderers} />
        </div>
      </DrawerBody>
      <TimesNote
        end={focused.endOf('month').toISODate() ?? ''}
        entries={events}
        start={focused.startOf('month').toISODate() ?? ''}
      />
    </>
  )
}
