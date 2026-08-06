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

// The zone the physical classes are authored in (they carry their own IANA zone); the online
// one is authored in UTC — its `firstDate_tz` is null, which the expansion reads as UTC.
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
): CalendarSourceEvent => {
  // Online events read in the viewer's zone (null tz → the expansion treats the stored instant
  // as UTC); physical ones in their own. Author each occurrence in that same zone.
  const zone = online ? 'utc' : EVENT_ZONE

  return {
    id,
    title: `${city} meditation class`,
    path: `/${id}`,
    eventType: online ? 'online' : 'offline',
    regionName: city,
    locality: city,
    schedule: {
      firstDate: at(dayOffset, hour, minute, zone),
      firstDate_tz: online ? null : EVENT_ZONE,
      endTime: `${pad(hour + 1)}:${pad(minute)}`,
      recurrenceType: 'WEEKLY',
      upcomingDates: [0, 7, 14, 21].map((week) => at(dayOffset + week, hour, minute, zone)),
    },
  }
}

// A realistic slice of the seeded UK feed — a mix of morning and evening weekly classes across
// several cities (one online), plus a one-off weekend workshop.
const mockCalendarEvents = (): CalendarSourceEvent[] => [
  weekly(1, 'Harrow', 1, 11, 0),
  weekly(2, 'Slough', 1, 11, 30),
  weekly(3, 'Bath', 2, 18, 30),
  weekly(4, 'Sheffield', 2, 19, 0),
  // The online class is authored near noon UTC: it displays in the VIEWER's zone, and noon is
  // farthest from midnight either way, so its 1h span stays single-day across the plausible
  // reviewer band (US Pacific … India) rather than straddling a far-eastern viewer's midnight.
  weekly(5, 'London', 3, 12, 0, true),
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
      firstDate: at(6, 14, 0, EVENT_ZONE),
      firstDate_tz: EVENT_ZONE,
      endTime: '16:00',
      recurrenceType: null,
      upcomingDates: [at(6, 14, 0, EVENT_ZONE)],
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
const activeParams = filtersToParams(activeFilters)

// "Grid failure" stays on the EXAMPLE axis rather than moving to the State control,
// because the two throw at different depths and that is the whole point of the case: this
// one trips the boundary BELOW the header (issue #89), so the month nav, the view picker,
// the filter button, the close control and the pills all stay put and stay usable. The
// State control throws at the view level, replacing all of that. Compare the two.
const EXAMPLES = ['Month', 'Grid failure'] as const

// Not an array — `eventsToCalendarEntries` iterates it, so this throws during the grid's
// render rather than at fetch time. Deliberately unlike the seeded feed: what is being
// previewed is the BOUNDARY, and the cheapest honest way to trip it is data the grid
// cannot consume.
const POISONED = { notAnArray: true }

/**
 * CalendarView — the full-width month / week / list surface. Events are the (mocked) filtered
 * feed expanded into per-occurrence entries, labelled by city; our own header drives the views +
 * navigation, with the active-filter pills below it. Themed to our tokens (follows light/dark).
 *
 * The State control carries no not-found flavour: an unknown `?region=` slug means "no
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
      seed={(client: QueryClient) => {
        // Seed the default key (initial render) AND the active-filter key (once the params are
        // seeded into the URL) so the calendar resolves from cache either way.
        for (const filters of [DEFAULT_FILTERS, activeFilters]) {
          client.setQueryData<CalendarSourceEvent[]>(
            ['calendar', filtersKey(filters), locale],
            // The error case seeds a shape the expansion can't consume, so the throw
            // happens where a Schedule-X or contract failure would: inside CalendarGrid's
            // render, below the header. Cast because that is precisely the point — the
            // types say this can't happen, and the boundary exists for when it does.
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

Default.args = { example: 'Month', state: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: [...EXAMPLES],
    control: { type: 'radio' },
    defaultValue: 'Month',
  },
  state: stateControl(),
}

Default.storyName = 'Calendar'
