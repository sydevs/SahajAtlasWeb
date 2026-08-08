import type { Story, StoryDefault } from '@ladle/react'
import type { EventSchedule } from '@/types'

// Not in the molecules barrel (it would go eager) — import from the co-located file.
import { StoryWrapper, StorySection } from '../../ladle'

import { AddToCalendar } from './AddToCalendar'

export default { title: 'Molecules' } satisfies StoryDefault

// Wednesdays 19:30–20:45 in Prague, with a cancelled week — the shape that
// exercises RRULE + EXDATE + TZID in the downloaded file.
const weekly: EventSchedule = {
  firstDate: new Date('2026-07-01T17:30:00Z'),
  firstDate_tz: 'Europe/Prague',
  endTime: '20:45',
  recurrenceType: 'WEEKLY',
  interval: 1,
  weekdays: ['WE'],
  exclusions: [{ startDate: new Date('2026-08-12T00:00:00Z') }],
  upcomingDates: [new Date('2026-07-22T17:30:00Z')],
}

const oneOff: EventSchedule = {
  firstDate: new Date('2026-09-19T08:00:00Z'),
  firstDate_tz: 'Europe/London',
  endTime: '11:00',
  upcomingDates: [new Date('2026-09-19T08:00:00Z')],
}

/**
 * AddToCalendar — the five export targets offered on the registration
 * confirmation. Apple is the `.ics` download (a real file, so it is a button);
 * the other four are ordinary link-outs, so middle-click and long-press behave.
 *
 * Press Apple to download and open the file in a real calendar app — that is the
 * only way to see the recurrence, the timezone and the cancelled week land
 * correctly, and it is what the unit lane cannot assert.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="A weekly class with a cancelled week. The .ics carries DTSTART;TZID + RRULE + EXDATE, and so does the Google link (via ctz + recur). Outlook, Office 365 and Yahoo have no recurrence parameter at all, so they receive the single next session instead of the series."
      title="Recurring"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <AddToCalendar
          event={{
            id: 1,
            title: 'Evening Meditation',
            schedule: weekly,
            location: '5 Market St, Prague',
            url: 'https://atlas.example/e/1',
          }}
        />
      </div>
    </StorySection>

    <StorySection
      description="A one-off. No RRULE, and every provider gets the same single date."
      title="One-off"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <AddToCalendar
          event={{
            id: 2,
            title: 'Introduction to Meditation',
            schedule: oneOff,
            location: 'Cambridge Guildhall',
            url: 'https://atlas.example/e/2',
          }}
        />
      </div>
    </StorySection>

    <StorySection
      description="An online class carries no LOCATION: the event's `whereLine` there names where the class is hosted FROM, which as a calendar location would send the viewer to a city they have no business in. The event's own page rides the description instead."
      title="Online (no location)"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <AddToCalendar
          event={{
            id: 3,
            title: 'Online Meditation',
            schedule: weekly,
            url: 'https://atlas.example/e/3',
          }}
        />
      </div>
    </StorySection>
  </StoryWrapper>
)

Default.storyName = 'Add To Calendar'
