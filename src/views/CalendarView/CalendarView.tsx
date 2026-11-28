import { Suspense, useMemo, useRef } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'
import { ChevronRight } from 'lucide-react'

import { MonthView } from './MonthView'
import { WeekList } from './WeekList'

import { Button } from '@/components/atoms/Button'
import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { CALENDAR_HEADER } from '@/components/organisms/Skeleton/Skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { ActiveFilterChips, ResetErrorBoundary } from '@/components/molecules'
import api, { regionsQuery } from '@/config/api'
import { regionRoute } from '@/config/api/fetch'
import { useIsWideWidget } from '@/config/responsive'
import { useCalendarPosition } from '@/config/store'
import { useEventFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import {
  type CalendarViewName,
  type CalendarWindow,
  type EventFilters,
  DEFAULT_FILTERS,
  calendarViewFromParams,
  isCalendarFullWidth,
  calendarViewToParams,
  calendarWindow,
  cameFrom,
  entryDay,
  eventsToCalendarEntries,
  filtersKey,
  hasActiveFilters,
  shiftWeek,
  todayISO,
  weekFrom,
} from '@/lib/shape'
import { formatDateRange, formatMonth, zoneCity } from '@/lib/time'
import { BackButton } from '@/views/nav'
import { DrawerTitle, ExpandSheetButton, FilterButton, useDrawerControl } from '@/views/shared'
import { DrawerErrorBody, DrawerLoadingBody } from '@/views/fallbacks'
import { FilterMenus } from '@/components/organisms/FilterMenus'

// The date the Month has in view, or today until the visitor moves it.
const useFocusedDate = () => useCalendarPosition((s) => s.date) ?? todayISO()

const setFocused = (day: string) => useCalendarPosition.getState().setDate(day)

// The place is the calendar's title, not a filter the visitor added.
const chosen = (filters: EventFilters): EventFilters => ({ ...filters, region: null })

/** Switches the view in place, the Week opening on `week`, or on today without one. */
function useSetCalendarView() {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()

  return (view: CalendarViewName, week: string | null = null) =>
    setSearchParams((prev) => calendarViewToParams(view, week, new URLSearchParams(prev)), {
      // `state` carries the entry's depth, which a replace without it would strip.
      replace: true,
      state: location.state,
    })
}

// The place the calendar is scoped to, from the cache-once region tree.
function usePlace(slug: string | null) {
  const { data: regions } = useQuery(regionsQuery())

  return useMemo(() => {
    const node = slug ? regions?.find((region) => region.slug === slug) : undefined

    return { name: node?.name ?? undefined, path: node ? regionRoute(node) : '/' }
  }, [regions, slug])
}

function CalendarHeader({
  view,
  week,
  fullWidth,
}: {
  view: CalendarViewName
  week: CalendarWindow
  fullWidth: boolean
}) {
  const { t } = useTranslation()
  const { formatLocale } = useLocale()
  const setView = useSetCalendarView()
  const filters = useEventFilters()
  const { dismiss } = useDrawerControl()
  const navigate = useNavigate()
  const location = useLocation()
  const focused = useFocusedDate()
  const place = usePlace(filters.region)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const today = todayISO()
  const isWeek = view === 'week'
  const month = DateTime.fromISO(focused).startOf('month')
  const label = !isWeek
    ? formatMonth(month, formatLocale)
    : week.isThisWeek
      ? t('calendar.next_7_days')
      : formatDateRange(DateTime.fromISO(week.start), DateTime.fromISO(week.end), formatLocale)
  // Nothing before today has classes, so neither view pages back past it.
  const atStart = isWeek ? week.isThisWeek : month <= DateTime.now().startOf('month')

  const pick = (day: string) => (isWeek ? setView('week', weekFrom(day, today)) : setFocused(day))

  // The place's own list. Opened from it, the calendar steps back to it, so flipping between the
  // two never piles up entries behind Back.
  const goToList = () =>
    cameFrom(location, place.path)
      ? dismiss()
      : navigate(place.path, { replace: true, state: location.state })

  const step = (direction: -1 | 1) => {
    if (isWeek) return setView('week', shiftWeek(week, direction, today))

    const next = month.plus({ months: direction })

    // This month opens on today, so the phone list starts on a day still to come.
    setFocused((next.hasSame(DateTime.now(), 'month') ? today : next.toISODate()) ?? today)
  }

  const switchTo = (next: string) => {
    if (next === 'list') return goToList()
    if (next !== 'month' && next !== 'week') return
    // The Month opens on the Week's first day.
    if (next === 'month' && isWeek) setFocused(week.start)
    setView(next)
  }

  return (
    <>
      <div className="flex w-full items-center justify-between gap-2">
        <BackButton />
        {/* Full width, the calendar covers the map, so its header carries the filter buttons. */}
        {fullWidth ? (
          <FilterMenus />
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <FilterButton iconOnly counted={chosen(filters)} />
          </div>
        )}
      </div>
      {/* Pulled down to the peek, the way to raise the sheet again, as every other header has. */}
      <ExpandSheetButton />
      <DrawerTitle title={place.name ?? t('calendar.title')} />

      <div className="flex w-full flex-wrap items-center gap-2">
        <ToggleGroup
          joined
          aria-label={t('calendar.title')}
          type="single"
          value={view}
          onValueChange={switchTo}
        >
          <ToggleGroupItem value="month">{t('calendar.view_month')}</ToggleGroupItem>
          <ToggleGroupItem value="week">{t('calendar.view_week')}</ToggleGroupItem>
          {/* The place's own list, so a visitor moves between the two from the one switch. */}
          <ToggleGroupItem value="list">{t('calendar.view_list')}</ToggleGroupItem>
        </ToggleGroup>

        <div className="flex items-center gap-0.5">
          <Button
            isIconOnly
            aria-label={t('calendar.a11y.previous')}
            disabled={atStart}
            size="sm"
            variant="ghost"
            onClick={() => step(-1)}
          >
            <ChevronRight className="h-4 w-4 rotate-180 rtl:-scale-x-100" />
          </Button>

          {/* The label opens the browser's own date picker, which has its own Today. The input
              overlays the label so the picker anchors to it, and stays click-through. Its
              `field-size` keeps Safari from zooming should it ever take focus (#322). */}
          <div className="relative">
            <button
              // A drawn 44px on a touch screen, like the arrows either side (#432).
              className="inline-flex items-center rounded-lg px-1.5 py-1 text-sm font-medium hover:bg-primary-3 pointer-coarse:min-h-11 pointer-coarse:px-3"
              type="button"
              onClick={() => dateInputRef.current?.showPicker?.()}
            >
              {label}
            </button>
            <input
              ref={dateInputRef}
              aria-label={t('calendar.a11y.pick_date')}
              className="pointer-events-none absolute inset-0 h-full w-full field-size opacity-0"
              min={today}
              tabIndex={-1}
              type="date"
              value={isWeek ? week.start : focused}
              onChange={(event) => event.target.value && pick(event.target.value)}
            />
          </div>

          <Button
            isIconOnly
            aria-label={t('calendar.a11y.next')}
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

/**
 * The calendar, at `/calendar`, optionally scoped with `?region=<slug>`: a Month, or the Week
 * (`?view=week`) of a place's next seven days. The entries are the filtered feed
 * (`getCalendarEvents`) expanded into one per upcoming occurrence, each at its own wall clock.
 * This view is placeless, so it never frames the map. The Filter button opens FilterView as an
 * overlay over this still-mounted view (DrawerStack).
 */
export function CalendarView() {
  const filters = useEventFilters()
  const [params] = useSearchParams()
  const view = calendarViewFromParams(params)
  const week = calendarWindow(params, todayISO())
  const fullWidth = isCalendarFullWidth('calendar', useIsWideWidget(), view)

  return (
    <>
      <DrawerHeader className={CALENDAR_HEADER}>
        <CalendarHeader fullWidth={fullWidth} view={view} week={week} />
      </DrawerHeader>
      {/* Full width, the filter buttons in the header name every answer. */}
      {!fullWidth && <ActiveFilterChips filters={chosen(filters)} />}
      {/* The body owns the `['calendar', …]` read, so a failed read keeps the working header
          above it rather than escalating to the drawer boundary (#89). `resetKeys` moves it on
          when the filters do (`listResetKey`, lib/shape/path.ts). */}
      <ResetErrorBoundary FallbackComponent={DrawerErrorBody} resetKeys={[filtersKey(filters)]}>
        {/* Below the header, so the body's placeholder alone: the drawer's own fallback draws
            the same month, so the two hand over without a change. */}
        <Suspense fallback={<DrawerLoadingBody body={view === 'week' ? 'classes' : 'calendar'} />}>
          <CalendarBody filters={filters} view={view} week={week} />
        </Suspense>
      </ResetErrorBoundary>
    </>
  )
}

function CalendarBody({
  filters,
  view,
  week,
}: {
  filters: EventFilters
  view: CalendarViewName
  week: CalendarWindow
}) {
  const { t } = useTranslation()
  const { locale, formatLocale } = useLocale()
  const isWide = useIsWideWidget()
  const focused = useFocusedDate()
  const setView = useSetCalendarView()
  const today = todayISO()
  // A busy Month day's "+ N classes", or an empty week's next class, opens the Week from it.
  const openWeek = (day: string) => setView('week', weekFrom(day, today))
  // One read for every date, so paging the Week or the Month never refetches.
  const anyDate = { ...filters, dateRange: DEFAULT_FILTERS.dateRange }
  const anyDateKey = filtersKey(anyDate)
  const { data: source } = useSuspenseQuery({
    queryKey: ['calendar', anyDateKey, locale],
    queryFn: () => api.getCalendarEvents(anyDate),
  })

  // Keyed on the filters' string form, so a page of the Week does not expand the whole feed again.
  const shownKey = filtersKey(filters)
  const entries = useMemo(
    () => eventsToCalendarEntries(source, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `shownKey` stands in for the filters it is built from.
    [source, shownKey],
  )
  // The days on screen: the Week's seven, or the Month's month.
  const onScreen = (day: string) =>
    view === 'week' ? day >= week.start && day <= week.end : day.startsWith(focused.slice(0, 7))

  // Says whose clock the times are in: an in-person class reads in its own zone and an online
  // one in the viewer's, so a London visitor's 1:00 AM Toronto class looks like a mistake
  // without it (#25). Only while an online class is on screen.
  const hasOnline = entries.some((entry) => entry.online && onScreen(entryDay(entry)))

  return (
    <>
      {hasOnline && (
        <p className="shrink-0 px-gutter py-3 text-xs text-gray-11">
          {t('calendar.times_note', { zone: zoneCity(DateTime.local().zoneName) })}
        </p>
      )}
      {/* The Week's day bands stick to the body's own top edge, so it takes no top padding. */}
      <DrawerBody className={`max-w-none pb-4 ${view === 'week' ? '' : 'px-gutter pt-4'}`}>
        {view === 'week' ? (
          <WeekList
            entries={entries}
            filtered={hasActiveFilters(chosen(filters))}
            locale={formatLocale}
            week={week}
            onWeekFrom={openWeek}
          />
        ) : (
          <MonthView
            entries={entries}
            focused={focused}
            isWide={isWide}
            locale={formatLocale}
            onFocus={setFocused}
            onWeekFrom={openWeek}
          />
        )}
      </DrawerBody>
    </>
  )
}
