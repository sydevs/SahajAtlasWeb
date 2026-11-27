import { Suspense, useMemo, useRef } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'
import { ChevronRight } from 'lucide-react'

import { MonthView } from './MonthView'
import { ShareWeek } from './ShareWeek'
import { WeekList } from './WeekList'

import { Button } from '@/components/atoms/Button'
import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { ActiveFilterPills, ResetErrorBoundary } from '@/components/molecules'
import api, { regionsQuery } from '@/config/api'
import { useIsWideWidget } from '@/config/responsive'
import { useCalendarPosition } from '@/config/store'
import { useCalendarView, useSetCalendarView } from '@/hooks/use-calendar-view'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import {
  type CalendarViewName,
  type CalendarWindow,
  type EventFilters,
  CALENDAR_WEEK_PARAM,
  DEFAULT_FILTERS,
  calendarWindow,
  eventsToCalendarEntries,
  filtersFromParams,
  filtersKey,
  filtersToParams,
  hasActiveFilters,
  safePath,
  shiftWeek,
  todayISO,
  weekFrom,
} from '@/lib/shape'
import { formatDateRange, formatMonth, zoneCity } from '@/lib/time'
import { BackButton } from '@/views/nav'
import { DrawerTitle, ExpandSheetButton, FilterButton } from '@/views/shared'
import { DrawerErrorBody, DrawerLoadingBody } from '@/views/fallbacks'

const NO_DATES = { start: null, end: null }

// The date the Month has in view, or today until the visitor moves it.
const useFocusedDate = () => useCalendarPosition((s) => s.date) ?? todayISO()

const setFocused = (day: string) => useCalendarPosition.getState().setDate(day)

/**
 * The filters a visitor chose, for the pills and the Filters count. The place is the calendar's
 * title, and on the Week the dates are its arrows: neither is a restriction they added.
 */
export const chosenCalendarFilters = (
  filters: EventFilters,
  view: CalendarViewName,
): EventFilters => ({
  ...filters,
  region: null,
  dateRange: view === 'week' ? NO_DATES : filters.dateRange,
})

/** The address a shared week opens: this place, these filters, the Week, and its seven days. */
export const shareWeekRoute = (filters: EventFilters, week: CalendarWindow): string => {
  const params = filtersToParams({ ...filters, dateRange: { start: week.start, end: week.end } })

  params.set('view', CALENDAR_WEEK_PARAM)

  return `/calendar?${params}`
}

/** Opens the Week on the seven days from a day, in place. */
function useOpenWeek() {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()

  return (day: string) =>
    setSearchParams(
      (prev) => {
        const next = filtersToParams(
          { ...filtersFromParams(prev), dateRange: weekFrom(day) },
          new URLSearchParams(prev),
        )

        next.set('view', CALENDAR_WEEK_PARAM)

        return next
      },
      { replace: true, state: location.state },
    )
}

// The place the calendar is scoped to, from the cache-once region tree.
function usePlace(slug: string | null) {
  const { data: regions } = useQuery(regionsQuery())
  const node = slug ? regions?.find((region) => region.slug === slug) : undefined

  return { name: node?.name ?? undefined, path: safePath(node?.webPath) }
}

/**
 * "See list": the place's own list. Opened from that list, this steps back to it, so flipping
 * between the two never piles up entries behind Back.
 */
function SeeListButton({ path }: { path: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  return (
    <Button
      className="shrink-0"
      color="primary"
      size="sm"
      variant="flat"
      onClick={() =>
        from?.split('?')[0] === path
          ? navigate(-1)
          : navigate(path, { replace: true, state: location.state })
      }
    >
      {t('calendar.see_list')}
    </Button>
  )
}

function CalendarHeader({ view, week }: { view: CalendarViewName; week: CalendarWindow }) {
  const { t } = useTranslation()
  const { formatLocale } = useLocale()
  const setView = useSetCalendarView()
  const filters = useEventFilters()
  const { setDateRange } = useSetFilters()
  const focused = useFocusedDate()
  const place = usePlace(filters.region)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const today = todayISO()
  const isWeek = view === 'week'
  const weekDates = formatDateRange(
    DateTime.fromISO(week.start),
    DateTime.fromISO(week.end),
    formatLocale,
  )
  const month = DateTime.fromISO(focused).startOf('month')
  const label = isWeek
    ? week.isThisWeek
      ? t('calendar.next_7_days')
      : weekDates
    : formatMonth(month, formatLocale)
  // Nothing before today has classes, so neither view pages back past it.
  const atStart = isWeek ? week.isThisWeek : month <= DateTime.now().startOf('month')

  const pick = (day: string) =>
    isWeek ? setDateRange(day <= today ? NO_DATES : weekFrom(day)) : setFocused(day)

  const step = (direction: -1 | 1) => {
    if (isWeek) return setDateRange(shiftWeek(week, direction, today))

    const next = month.plus({ months: direction })

    // This month opens on today, so the phone list starts on a day still to come.
    setFocused((next.hasSame(DateTime.now(), 'month') ? today : next.toISODate()) ?? today)
  }

  const switchTo = (next: string) => {
    if (next !== 'month' && next !== 'week') return
    // The Week's dates do not follow the visitor to the Month, which opens on the first of them.
    if (next === 'month' && isWeek) setFocused(week.start)
    setView(next)
  }

  return (
    <>
      <div className="flex w-full items-center justify-between gap-2">
        <BackButton />
        <div className="flex shrink-0 items-center gap-1">
          {isWeek && <ShareWeek dates={weekDates} route={shareWeekRoute(filters, week)} />}
          <FilterButton iconOnly counted={chosenCalendarFilters(filters, view)} />
        </div>
      </div>
      {/* Pulled down to the peek, the way to raise the sheet again, as every other header has. */}
      <ExpandSheetButton />
      <div className="flex w-full items-center justify-between gap-2">
        <DrawerTitle title={place.name ?? t('calendar.title')} />
        {place.path && <SeeListButton path={place.path} />}
      </div>

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
  const view = useCalendarView()
  const week = calendarWindow(filters.dateRange, todayISO())

  return (
    <>
      <DrawerHeader className="max-w-none flex-wrap items-center gap-x-3 gap-y-2">
        <CalendarHeader view={view} week={week} />
      </DrawerHeader>
      <ActiveFilterPills filters={chosenCalendarFilters(filters, view)} />
      {/* The body owns the `['calendar', …]` read, so a failed read keeps the working header
          above it rather than escalating to the drawer boundary (#89). `resetKeys` moves it on
          when the filters do (`listResetKey`, lib/shape/path.ts). */}
      <ResetErrorBoundary FallbackComponent={DrawerErrorBody} resetKeys={[filtersKey(filters)]}>
        <Suspense fallback={<DrawerLoadingBody />}>
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
  const { setFilters } = useSetFilters()
  const openWeek = useOpenWeek()
  // One read for every date, so paging the Week or the Month never refetches.
  const anyDate = useMemo(() => ({ ...filters, dateRange: NO_DATES }), [filters])
  const { data: source } = useSuspenseQuery({
    queryKey: ['calendar', filtersKey(anyDate), locale],
    queryFn: () => api.getCalendarEvents(anyDate),
  })

  // The "Online" term is the one the class pages show for an online class's location.
  const onlineLabel = t('event.display.online')
  // The Month keeps a dates filter as a filter; the Week cuts its own seven days.
  const entries = useMemo(
    () => eventsToCalendarEntries(source, view === 'week' ? anyDate : filters, { onlineLabel }),
    [source, view, anyDate, filters, onlineLabel],
  )
  const shown =
    view === 'week'
      ? entries.filter((entry) => entry.start >= week.start && entry.start <= `${week.end} 24`)
      : entries

  // Says whose clock the times are in: an in-person class reads in its own zone and an online
  // one in the viewer's, so a London visitor's 1:00 AM Toronto class looks like a mistake
  // without it (#25). It sits above the times it explains.
  const hasOnline = shown.some((entry) => entry.online)

  return (
    <>
      {hasOnline && (
        <p className="shrink-0 px-gutter pt-3 text-xs text-gray-11">
          {t('calendar.times_note', { zone: zoneCity(DateTime.local().zoneName) })}
        </p>
      )}
      <DrawerBody className={`max-w-none py-4 ${view === 'week' ? '' : 'px-gutter'}`}>
        {view === 'week' ? (
          <WeekList
            entries={entries}
            filtered={hasActiveFilters(chosenCalendarFilters(filters, 'week'))}
            locale={formatLocale}
            window={week}
            onClearFilters={() =>
              setFilters({
                ...DEFAULT_FILTERS,
                region: filters.region,
                dateRange: filters.dateRange,
              })
            }
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
