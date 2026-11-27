import { useLocation, useSearchParams } from 'react-router'

import {
  type CalendarViewName,
  type DateRange,
  calendarViewFromParams,
  calendarViewToParams,
  filtersFromParams,
  filtersToParams,
} from '@/lib/shape'

/** The calendar's view, from the URL, so a shared link opens the view it was sent from. */
export const useCalendarView = (): CalendarViewName => {
  const [params] = useSearchParams()

  return calendarViewFromParams(params)
}

/**
 * Switches the calendar's view in place, in one write: two functional updates of the query in a
 * row would not see each other. The Week opens on `dates` where given. Its dates are its arrows,
 * not a filter, so they do not follow the visitor to the Month.
 */
export function useSetCalendarView() {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()

  return (view: CalendarViewName, dates?: DateRange) =>
    setSearchParams(
      (prev) => {
        const filters = filtersFromParams(prev)
        const dateRange =
          view === 'week' ? (dates ?? filters.dateRange) : { start: null, end: null }

        return calendarViewToParams(
          view,
          filtersToParams({ ...filters, dateRange }, new URLSearchParams(prev)),
        )
      },
      // `state` carries the entry's depth, which a replace without it would strip.
      { replace: true, state: location.state },
    )
}
