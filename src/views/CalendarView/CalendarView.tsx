import { Suspense, useMemo, useRef } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'
import { useNextCalendarApp } from '@schedule-x/react'
import {
  createViewList,
  createViewMonthAgenda,
  createViewMonthGrid,
  createViewWeek,
} from '@schedule-x/calendar'
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls'
import { ChevronRight } from 'lucide-react'

import '@schedule-x/theme-default/dist/index.css'

import { CalendarMount } from './CalendarMount'

import { Button } from '@/components/atoms/Button'
import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { ActiveFilterPills, ResetErrorBoundary } from '@/components/molecules'
import api from '@/config/api'
import { useIsWideWidget } from '@/config/responsive'
import { useCalendarPosition } from '@/config/store'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useEventFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'
import {
  CALENDAR_VIEW_LIST,
  CALENDAR_VIEW_MONTH,
  CALENDAR_VIEW_WEEK,
  type EventFilters,
  computeDayBoundaries,
  eventsToCalendarEntries,
  filtersKey,
  isCalendarViewOption,
  resolveCalendarView,
} from '@/lib/shape'
import { CloseButton, FilterButton } from '@/views/shared'
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

const toScheduleXLocale = (locale: string): string => SX_LOCALES[locale] ?? 'en-US'

// Online programs get their own colour, the secondary ramp, so they stand out from
// in-person events on the grid. Entries built with `calendarId: 'online'` (see
// eventsToCalendarEntries) pick it up. Light and dark share the same token strings — the
// `--secondary-*` CSS vars adapt to the theme on the `.sx-calendar` wrapper, so SX's own
// isDark colour switch is not needed.
const ONLINE_COLORS = {
  main: 'hsl(var(--secondary-9))',
  container: 'hsl(var(--secondary-4))',
  onContainer: 'hsl(var(--secondary-11))',
}
const CALENDARS = {
  online: { colorName: 'online', lightColors: ONLINE_COLORS, darkColors: ONLINE_COLORS },
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

// This drives Schedule-X from this project's own header, rather than styling its built-in
// one, whose date picker, view dropdown, and nav kept causing conflicts. The `calendar-controls`
// plugin is a public API (`setView`/`setDate`/`getRange`/…), so the header uses this project's
// own atoms — one consistent drawer header — and SX's header bar stays hidden in globals.css.
function CalendarControls({ controls }: { controls: CalendarControlsPlugin }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const isWide = useIsWideWidget()
  const stored = useCalendarPosition((s) => s.view)
  // The OPTION, not the stored name: below the crossing a stored `week` renders a month
  // agenda, so the lit button, the label and the paging step must all follow what rendered.
  const { option } = resolveCalendarView(stored, isWide)
  const date = useCalendarPosition((s) => s.date)
  const dateInputRef = useRef<HTMLInputElement>(null)

  // The focused date (falls back to today until the grid reports one). The header label,
  // localized straight from luxon (no per-month i18n key), shows the month + year in month view,
  // but the specific date (condensed month) in the week + list views — for the week its first day.
  const focused = date ?? DateTime.now().toISODate()
  const dt = focused ? DateTime.fromISO(focused).setLocale(locale) : null
  const label = !dt
    ? ''
    : option === CALENDAR_VIEW_MONTH
      ? dt.toLocaleString({ month: 'long', year: 'numeric' })
      : (option === CALENDAR_VIEW_WEEK ? dt.startOf('week') : dt).toLocaleString({
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })

  const applyDate = (next: string) => {
    useCalendarPosition.getState().setDate(next)
    drive(controls, (c) => c.setDate(next))
  }

  // The store takes what was PICKED, never the width-specific view that renders for it, so a
  // `week` picked on a desktop lights Week again after a trip through a phone width.
  const selectView = (next: string) => {
    if (!isCalendarViewOption(next)) return
    useCalendarPosition.getState().setView(next)
    drive(controls, (c) => c.setView(resolveCalendarView(next, isWide).view))
  }

  // Page one period off the focused date — a month in month view, a week in week view, a day in
  // list view (matching the built-in nav's semantics per view).
  const step = (dir: -1 | 1) => {
    if (!focused) return

    const base = DateTime.fromISO(focused)
    const moved =
      option === CALENDAR_VIEW_MONTH
        ? base.plus({ months: dir })
        : option === CALENDAR_VIEW_WEEK
          ? base.plus({ weeks: dir })
          : base.plus({ days: dir })
    const next = moved.toISODate()

    if (next) applyDate(next)
  }

  return (
    <>
      {/* Mode picker — first item, so it holds the top row when the rest wraps below. */}
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
              value={focused ?? ''}
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

        <FilterButton />
      </div>

      {/* Close — pinned top-right so it sits in the same spot as every other drawer, even when
          the header wraps to two rows. */}
      <CloseButton className="absolute end-4 top-4" />
    </>
  )
}

// The full-width calendar, at route `/calendar`, optionally with `?region=<slug>`. Its
// entries are the filtered feed (`getCalendarEvents`) expanded into one per upcoming
// occurrence — timezone-correct, online events included — on a Schedule-X month, week, or
// list (agenda) grid whose `--sx-*` tokens are mapped to this project's theme (see
// globals.css). This view is placeless, so it never frames the map. Clicking an entry opens
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
export function CalendarView() {
  const filters = useEventFilters()
  // Shared with the grid (which registers + binds it) and the header (which drives it). Stable
  // across filter-apply remounts — the grid re-binds the same plugin to each new instance.
  const controls = useMemo(() => createCalendarControlsPlugin(), [])

  return (
    <>
      <DrawerHeader className="relative max-w-none flex-wrap items-center gap-x-3 gap-y-2 pe-12">
        <CalendarControls controls={controls} />
      </DrawerHeader>
      <ActiveFilterPills />
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
          <CalendarGrid key={filtersKey(filters)} controls={controls} filters={filters} />
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

  const { data: source } = useSuspenseQuery({
    queryKey: ['calendar', filtersKey(filters), locale],
    queryFn: () => api.getCalendarEvents(filters),
  })

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
      views: [createViewMonthGrid(), createViewMonthAgenda(), createViewWeek(), createViewList()],
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
      callbacks: {
        // Each entry carries its event's route. This opens the matching EventView — the atlas
        // navigate stamps camera and depth like every other in-widget push.
        onEventClick: (event) => {
          if (typeof event.path === 'string') navigate(event.path)
        },
        // Persist the focused date as the user pages through the calendar (drives the header label).
        onSelectedDateUpdate: (date) => useCalendarPosition.getState().setDate(date),
        // The month grid's "+N more" jumps to the list view focused on that day.
        onClickPlusEvents: (date) => {
          controls.setDate(date)
          controls.setView(CALENDAR_VIEW_LIST)
          useCalendarPosition.getState().setDate(date)
          useCalendarPosition.getState().setView(CALENDAR_VIEW_LIST)
        },
      },
      weekOptions: {
        eventWidth: 98,
      },
    },
    [controls],
  )

  return (
    <DrawerBody className="max-w-none overflow-hidden p-4">
      <div className="sx-calendar">
        <CalendarMount calendar={calendar} />
      </div>
    </DrawerBody>
  )
}
