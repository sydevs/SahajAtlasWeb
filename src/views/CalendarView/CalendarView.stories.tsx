import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { CalendarSourceEvent } from '@/lib/shape'

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { ViewHarness } from '@/views/story-harness'
import { CalendarView } from '@/views/CalendarView/CalendarView'
import { useLocale } from '@/hooks/use-locale'
import { DEFAULT_FILTERS, filtersKey, filtersToParams } from '@/lib/shape'

export default { title: 'Views' } satisfies StoryDefault

// An occurrence `dayOffset` days from now at `hh:mm` — anchored to render time so the
// occurrences land inside the calendar's (today-anchored) visible window.
const at = (dayOffset: number, hour: number, minute = 0): Date => {
  const date = new Date()

  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, minute, 0, 0)

  return date
}

const pad = (n: number) => String(n).padStart(2, '0')

// A weekly class in `city` (its region + locality — what the calendar labels events by) at hh:mm,
// running an hour, physical unless `online`. Occurrences repeat weekly so the grid fills out. All
// single-day + timed, matching the real feed (no all-day or multi-day events).
const weekly = (
  id: number,
  city: string,
  dayOffset: number,
  hour: number,
  minute = 0,
  online = false,
): CalendarSourceEvent => ({
  id,
  title: `${city} meditation class`,
  path: `/${id}`,
  eventType: online ? 'online' : 'offline',
  regionName: city,
  locality: city,
  schedule: {
    firstDate: at(dayOffset, hour, minute),
    // Online events read in the viewer's zone (null tz); physical ones in their own.
    firstDate_tz: online ? null : 'Europe/London',
    endTime: `${pad(hour + 1)}:${pad(minute)}`,
    recurrenceType: 'WEEKLY',
    upcomingDates: [0, 7, 14, 21].map((week) => at(dayOffset + week, hour, minute)),
  },
})

// A realistic slice of the seeded UK feed — a mix of morning and evening weekly classes across
// several cities (one online), plus a one-off weekend workshop.
const mockCalendarEvents = (): CalendarSourceEvent[] => [
  weekly(1, 'Harrow', 1, 11, 0),
  weekly(2, 'Slough', 1, 11, 30),
  weekly(3, 'Bath', 2, 18, 30),
  weekly(4, 'Sheffield', 2, 19, 0),
  weekly(5, 'London', 3, 18, 0, true),
  weekly(6, 'Edinburgh', 4, 11, 30),
  weekly(7, 'Leeds', 5, 19, 0),
  {
    id: 8,
    title: 'Cambridge weekend workshop',
    path: '/8',
    eventType: 'offline',
    regionName: 'Cambridge',
    locality: 'Cambridge',
    schedule: {
      firstDate: at(6, 14, 0),
      firstDate_tz: 'Europe/London',
      endTime: '16:00',
      recurrenceType: null,
      upcomingDates: [at(6, 14, 0)],
    },
  },
]

// A couple of applied filters so the pills row (below the header) renders. The story pre-seeds
// the calendar data regardless of the filters, so these are for the pill UI, not to cut events.
const activeFilters = {
  ...DEFAULT_FILTERS,
  format: 'offline' as const,
  timeOfDay: ['evening' as const],
}

// Seed the applied filters into the URL (their source of truth) on the decorator's own router —
// react-router v7 forbids nesting a second <Router>.
function SeedFilters({ children }: { children: React.ReactNode }) {
  const [, setSearchParams] = useSearchParams()

  useEffect(() => {
    setSearchParams(filtersToParams(activeFilters), { replace: true })
  }, [setSearchParams])

  return <>{children}</>
}

/**
 * CalendarView — the full-width month / week / list surface. Events are the (mocked) filtered
 * feed expanded into per-occurrence entries, labelled by city; our own header drives the views +
 * navigation, with the active-filter pills below it. Themed to our tokens (follows light/dark).
 */
export const Default: Story = () => {
  const { locale } = useLocale()
  const events = useMemo(() => mockCalendarEvents(), [])

  return (
    <ViewHarness
      seed={(client: QueryClient) => {
        // Seed the default key (initial render) AND the active-filter key (once SeedFilters sets
        // the URL) so the calendar resolves from cache either way.
        for (const filters of [DEFAULT_FILTERS, activeFilters]) {
          client.setQueryData<CalendarSourceEvent[]>(
            ['calendar', filtersKey(filters), locale],
            events,
          )
        }
      }}
      seedKey="calendar"
    >
      <SeedFilters>
        <CalendarView />
      </SeedFilters>
    </ViewHarness>
  )
}

Default.storyName = 'Calendar'
