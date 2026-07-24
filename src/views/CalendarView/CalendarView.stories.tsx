import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { CalendarSourceEvent } from '@/lib/shape'

import { useMemo } from 'react'

import { ViewHarness } from '@/views/story-harness'
import { CalendarView } from '@/views/CalendarView/CalendarView'
import { useLocale } from '@/hooks/use-locale'
import { DEFAULT_FILTERS, filtersKey } from '@/lib/shape'

export default { title: 'Views' } satisfies StoryDefault

// An occurrence `dayOffset` days from now at `hour` — anchored to render time so the
// occurrences land inside the calendar's (today-anchored) visible window.
const soon = (dayOffset: number, hour: number): Date => {
  const date = new Date()

  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, 0, 0, 0)

  return date
}

// A small mix — a weekly physical class, a weekly online class (viewer-zone), and a
// one-off — so the grid shows multiple entries across the coming weeks.
const mockCalendarEvents = (): CalendarSourceEvent[] => [
  {
    id: 1,
    title: 'Morning Meditation',
    path: '/1',
    eventType: 'offline',
    schedule: {
      firstDate: soon(2, 9),
      firstDate_tz: 'Europe/London',
      endTime: '10:00',
      recurrenceType: 'WEEKLY',
      upcomingDates: [soon(2, 9), soon(9, 9), soon(16, 9)],
    },
  },
  {
    id: 2,
    title: 'Online Class',
    path: '/2',
    eventType: 'online',
    schedule: {
      firstDate: soon(3, 18),
      firstDate_tz: null,
      endTime: '19:00',
      recurrenceType: 'WEEKLY',
      upcomingDates: [soon(3, 18), soon(10, 18)],
    },
  },
  {
    id: 3,
    title: 'Weekend Workshop',
    path: '/3',
    eventType: 'offline',
    schedule: {
      firstDate: soon(5, 14),
      firstDate_tz: 'Europe/London',
      endTime: '16:00',
      recurrenceType: null,
      upcomingDates: [soon(5, 14)],
    },
  },
]

/**
 * CalendarView — the full-width month/week/schedule surface. Events are the (mocked)
 * filtered feed expanded into per-occurrence entries; use Schedule-X's own header to
 * switch views and navigate months. Themed to our tokens, so it follows light/dark.
 */
export const Default: Story = () => {
  const { locale } = useLocale()
  const events = useMemo(() => mockCalendarEvents(), [])

  return (
    <ViewHarness
      seed={(client: QueryClient) =>
        client.setQueryData<CalendarSourceEvent[]>(
          ['calendar', filtersKey(DEFAULT_FILTERS), locale],
          events,
        )
      }
      seedKey="calendar"
    >
      <CalendarView />
    </ViewHarness>
  )
}

Default.storyName = 'Calendar'
