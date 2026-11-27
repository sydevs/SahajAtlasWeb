import { useLocation, useSearchParams } from 'react-router'

import { type CalendarViewName, calendarViewFromParams, calendarViewToParams } from '@/lib/shape'

/** The calendar's view, from the URL, so a shared link opens the view it was sent from. */
export const useCalendarView = (): CalendarViewName => {
  const [params] = useSearchParams()

  return calendarViewFromParams(params)
}

/**
 * Switches the calendar's view in place, on the Week's own day — `null` for this week, and
 * dropped altogether by the Month.
 */
export function useSetCalendarView() {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()

  return (view: CalendarViewName, week: string | null) =>
    setSearchParams((prev) => calendarViewToParams(view, week, new URLSearchParams(prev)), {
      // `state` carries the entry's depth, which a replace without it would strip.
      replace: true,
      state: location.state,
    })
}
