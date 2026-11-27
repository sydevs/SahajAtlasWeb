import { useCallback } from 'react'
import { useLocation, useSearchParams } from 'react-router'

import { type CalendarViewName, CALENDAR_WEEK_PARAM, calendarViewFromParams } from '@/lib/shape'

/** The calendar's view, from the URL, so a shared link opens the view it was sent from. */
export const useCalendarView = (): CalendarViewName => {
  const [params] = useSearchParams()

  return calendarViewFromParams(params)
}

/**
 * Switches the calendar's view in place. The Week's dates are its arrows, not a filter, so they
 * do not follow the visitor to the Month; the Month opens on the first of them instead.
 */
export function useSetCalendarView() {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()

  return useCallback(
    (view: CalendarViewName) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)

          if (view === 'week') {
            next.set('view', CALENDAR_WEEK_PARAM)
          } else {
            next.delete('view')
            next.delete('dates')
          }

          return next
        },
        // `state` carries the entry's depth, which a replace without it would strip.
        { replace: true, state: location.state },
      ),
    [setSearchParams, location.state],
  )
}
