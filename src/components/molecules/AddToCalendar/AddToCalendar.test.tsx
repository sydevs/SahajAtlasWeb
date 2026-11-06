import type { EventSchedule } from '@/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { AddToCalendar, calendarLinkTargets } from './AddToCalendar'

// Mock the i18n boundary, so the accessible name renders as real copy
// without booting i18next (the ShareContent/GeolocationPrompt template).
// This is the node lane, with no jsdom. See docs/testing.md.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'event.actions.add_calendar' ? 'Add to calendar' : key),
  }),
}))

// A Wednesday 19:30-20:45 class in Prague, running since 2019. This shape
// makes the anchor rule observable.
const schedule: EventSchedule = {
  firstDate: new Date('2019-01-02T18:30:00Z'),
  firstDate_tz: 'Europe/Prague',
  endTime: '20:45',
  recurrenceType: 'WEEKLY',
  interval: 1,
  weekdays: ['WE'],
  upcomingDates: [new Date('2026-07-22T17:30:00Z')],
}

const event = {
  id: 42,
  title: 'Evening Meditation',
  schedule,
  location: '5 Market St, Prague',
  url: 'https://atlas.example/e/42',
}

const hrefs = (input: Parameters<typeof calendarLinkTargets>[0]) =>
  calendarLinkTargets(input)
    .map(({ href }) => href)
    .join('\n')

describe('AddToCalendar', () => {
  // The menu's rows live in a Radix portal, which SSR does not render, so the trigger is
  // asserted here and the rows through `calendarLinkTargets`, the list they map over.
  it('renders one closed menu trigger, not a row of providers', () => {
    const html = renderToStaticMarkup(<AddToCalendar event={event} />)

    expect(html).toContain('Add to calendar')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).not.toContain('calendar.google.com')
  })

  it('offers every link-out provider', () => {
    const all = hrefs(event)

    expect(all).toContain('calendar.google.com/calendar/render')
    expect(all).toContain('outlook.live.com/calendar/0/deeplink/compose')
    expect(all).toContain('outlook.office.com/calendar/0/deeplink/compose')
    expect(all).toContain('calendar.yahoo.com')
  })

  it('sends the recurrence-less providers the NEXT session, not the 2019 start', () => {
    const all = hrefs(event)

    // Outlook and Yahoo take no recurrence parameter, so they get one
    // occurrence. The series began in 2019. A link carrying that date
    // would be useless.
    expect(all).toContain('startdt=2026-07-22T17%3A30%3A00.000Z')
    expect(all).toContain('st=20260722T173000Z')
    // Google's `dates` legitimately stays the 2019 series anchor, because it
    // carries the RRULE.
    expect(all).not.toContain('startdt=2019')
    expect(all).not.toContain('st=2019')
  })

  // The URL shapes themselves belong to `src/lib/ics.test.ts`. This pins the wiring:
  // that `from` reaches the right builder per provider.
  it('anchors the recurrence-less providers on the registered session when given', () => {
    const all = hrefs({ ...event, from: new Date('2026-08-05T17:30:00Z') })

    expect(all).toContain('startdt=2026-08-05T17%3A30%3A00.000Z')
    // Google stays on the series anchor. `from` must not move a DTSTART the
    // RRULE counts from.
    expect(all).toContain('dates=20190102T193000%2F20190102T204500')
  })
})
