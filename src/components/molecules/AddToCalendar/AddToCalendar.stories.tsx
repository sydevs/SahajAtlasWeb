import type { Story, StoryDefault } from '@ladle/react'
import type { EventSchedule } from '@/types'

// This is not in the molecules barrel, since it would go eager. Import it
// from the co-located file.
import { StoryWrapper, StorySection } from '../../ladle'

import { AddToCalendar } from './AddToCalendar'

export default { title: 'Molecules' } satisfies StoryDefault

// A weekly Wednesday 19:30-20:45 class in Prague, with a cancelled week.
// This shape exercises RRULE, EXDATE, and TZID in the downloaded file.
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
 * AddToCalendar — one "Add to calendar" button opening a menu of calendar
 * services, offered on the registration confirmation. Apple and Google
 * **subscribe** to the class's own feed, so a later change or cancellation
 * reaches the viewer on its own; Outlook, Office 365 and Yahoo add the next
 * session alone; the last row downloads a file.
 *
 * ⚠ **The feed addresses here are fictional, so no subscribe row can work in
 * Ladle.** They are minted by SahajCloud and carry a signed token. What this
 * story shows is the menu: its order, which rows are anchors, and the one case
 * the unit lane cannot — a class with no address, which offers the download
 * alone. Choose that last row to download and open the file in a real calendar
 * app, which is still the only way to watch the recurrence, the timezone and
 * the cancelled week land correctly.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="A weekly class with a cancelled week. Apple and Google subscribe to its feed, which carries every session and clears itself when one is cancelled. Outlook, Office 365 and Yahoo have no verified subscribe route, so they receive the single next session. The downloaded .ics carries DTSTART;TZID + RRULE + EXDATE."
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
            calendarFeedUrl: 'https://cloud.example/api/events/calendar/eyJhb.eyJldg.s1gn.ics',
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
            calendarFeedUrl: 'https://cloud.example/api/events/calendar/eyJhb.eyJvbg.s1gn.ics',
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
            calendarFeedUrl: 'https://cloud.example/api/events/calendar/eyJhb.eyJvbA.s1gn.ics',
          }}
        />
      </div>
    </StorySection>

    <StorySection
      description="No feed address — an unpublished class, or one whose event read came back without the field. Every subscribe row would be inert, so the menu offers the download alone."
      title="No feed address"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <AddToCalendar
          event={{
            id: 4,
            title: 'Morning Meditation',
            schedule: oneOff,
            location: 'Cambridge Guildhall',
            url: 'https://atlas.example/e/4',
          }}
        />
      </div>
    </StorySection>
  </StoryWrapper>
)

Default.storyName = 'Add To Calendar'
