import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { CalendarSourceEvent } from '@/lib/shape'

import { useMemo } from 'react'
import { DateTime } from 'luxon'

import { SeedSearchParams } from '@/components/ladle'
import { NO_ERROR, ViewStory, stateControl } from '@/views/story-harness'
import { CalendarView } from '@/views/CalendarView/CalendarView'
import { useLocale } from '@/hooks/use-locale'
import { DEFAULT_FILTERS, filtersKey, filtersToParams } from '@/lib/shape'

export default { title: 'Views' } satisfies StoryDefault

// The zone the physical classes are authored in — they carry their own IANA zone. The online
// one is authored in UTC. Its `firstDate_tz` is null, which the expansion reads as UTC.
const EVENT_ZONE = 'Europe/London'

// An occurrence `dayOffset` days from now at `hh:mm` IN `zone` — anchored to render time so the
// occurrences land inside the calendar's (today-anchored) visible window. Building the instant
// in the event's OWN zone (not machine-local time) keeps the mock timezone-robust: the event's
// wall-clock start is exactly `hh:mm`, so the event-local `endTime` always lands the same day
// whatever zone the dev machine is in — no occurrence renders as a multi-day span.
const at = (dayOffset: number, hour: number, minute: number, zone: string): Date =>
  DateTime.now()
    .setZone(zone)
    .plus({ days: dayOffset })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toJSDate()

const pad = (n: number) => String(n).padStart(2, '0')

// A weekly class at hh:mm in `city` (its region and its address's town), running an hour, in
// person unless `online`. Occurrences repeat weekly so the grid fills out, all single-day and
// timed, as the real feed is.
const weekly = (
  id: number,
  title: string,
  city: string,
  dayOffset: number,
  hour: number,
  minute = 0,
  online = false,
): CalendarSourceEvent => {
  // An online class reads in the viewer's zone (a null tz is read as UTC), an in-person one in
  // its own, and each occurrence is authored in that zone.
  const zone = online ? 'utc' : EVENT_ZONE

  return {
    id,
    title,
    path: `/${id}`,
    eventType: online ? 'online' : 'offline',
    regionName: online ? 'United Kingdom' : city,
    locality: online ? null : city,
    schedule: {
      firstDate: at(dayOffset, hour, minute, zone),
      firstDate_tz: online ? null : EVENT_ZONE,
      endTime: `${pad((hour + 1) % 24)}:${pad(minute)}`,
      recurrenceType: 'WEEKLY',
      upcomingDates: [0, 7, 14, 21].map((week) => at(dayOffset + week, hour, minute, zone)),
    },
  }
}

// The cases a calendar has to draw, a week of them repeating: a busy day mixing online and in
// person (more than three dots, more than a desktop box holds), a day with one of each, a lone
// online class, a town typed in capitals, a quiet day, and a one-off workshop. Online classes are
// authored near noon UTC, so they stay on one day across a reviewer's zone.
const mockCalendarEvents = (): CalendarSourceEvent[] => [
  weekly(1, 'Evening Meditation', 'Bath', 0, 20, 0),
  weekly(2, 'Morning Meditation', 'Harrow', 1, 9, 30),
  weekly(3, 'Introduction to Meditation', 'Slough', 1, 11, 0),
  weekly(4, 'Online Lunchtime Meditation', 'Online', 1, 12, 0, true),
  weekly(5, 'Evening Meditation', 'Sheffield', 1, 18, 30),
  weekly(6, 'Meditation for Beginners', 'Leeds', 1, 19, 30),
  weekly(7, 'Online Meditation', 'Online', 2, 12, 30, true),
  weekly(8, 'Evening Meditation', 'Edinburgh', 2, 19, 0),
  weekly(9, 'Online Morning Meditation', 'Online', 3, 11, 0, true),
  weekly(10, 'Meditation Evening', 'HARROGATE', 4, 19, 0),
  weekly(11, 'Morning Meditation', 'Brighton', 5, 10, 0),
  weekly(12, 'Afternoon Meditation', 'Oxford', 5, 14, 0),
  weekly(13, 'Evening Meditation', 'Bristol', 5, 19, 0),
  {
    id: 14,
    title: 'Weekend Meditation Workshop',
    path: '/14',
    eventType: 'offline',
    regionName: 'Cambridge',
    locality: 'Cambridge',
    schedule: {
      firstDate: at(6, 14, 0, EVENT_ZONE),
      firstDate_tz: EVENT_ZONE,
      endTime: '16:00',
      recurrenceType: null,
      upcomingDates: [at(6, 14, 0, EVENT_ZONE)],
    },
  },
]

// The calendar of a place, as a place page's Calendar button opens it. Filters a visitor adds
// in the story are answered by the Ladle backend rather than these classes.
const activeFilters = { ...DEFAULT_FILTERS, region: 'gb' }
const activeParams = filtersToParams(activeFilters)
const seededFilters = [activeFilters]

// "Grid failure" stays on the EXAMPLE axis rather than moving to the State control,
// because the two throw at different depths and that is the whole point of the case: this
// one trips the boundary BELOW the header (issue #89), so the month nav, the view picker,
// the filter button, the close control and the pills all stay put and stay usable. The
// State control throws at the view level, replacing all of that. Compare the two.
const EXAMPLES = ['Calendar', 'Grid failure'] as const

// Not an array — `eventsToCalendarEntries` iterates it, so this throws during the grid's
// render rather than at fetch time. Deliberately unlike the seeded feed: what is being
// previewed is the BOUNDARY, and the cheapest honest way to trip it is data the grid
// cannot consume.
const POISONED = { notAnArray: true }

/**
 * CalendarView — the full-width month, week, or list surface. Events are the mocked filtered
 * feed, expanded into per-occurrence entries and labelled by city. This project's own header
 * drives the views and navigation, with the active-filter pills below it. It is themed to this
 * project's tokens, and follows light and dark mode.
 *
 * The State control carries no not-found flavour. An unknown `?region=` slug means "no
 * restriction", never a throw, so this view's routes cannot 404.
 */
export const Default: Story<{ example: (typeof EXAMPLES)[number]; state: StoryFallbackArg }> = ({
  example,
  state,
}) => {
  const { locale } = useLocale()
  const events = useMemo(() => mockCalendarEvents(), [])

  return (
    <ViewStory
      example={example}
      path="/calendar"
      seed={(client: QueryClient) => {
        // The calendar reads one key for every date, so the place's key answers it.
        for (const filters of seededFilters) {
          client.setQueryData<CalendarSourceEvent[]>(
            ['calendar', filtersKey(filters), locale],
            // The error case seeds a shape the expansion cannot consume, so the throw happens
            // where a contract failure would: inside CalendarBody's render,
            // below the header. This casts the value because that is precisely the point. The
            // types say this cannot happen, and the boundary exists for when it does.
            example === 'Grid failure' ? (POISONED as unknown as CalendarSourceEvent[]) : events,
          )
        }
      }}
      state={state}
    >
      <SeedSearchParams params={activeParams}>
        <CalendarView />
      </SeedSearchParams>
    </ViewStory>
  )
}

Default.args = { example: 'Calendar', state: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: [...EXAMPLES],
    control: { type: 'radio' },
    defaultValue: 'Calendar',
  },
  state: stateControl(),
}

Default.storyName = 'Calendar'
