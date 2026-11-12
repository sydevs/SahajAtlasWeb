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

const FEED = 'https://cloud.sydevelopers.com/api/events/calendar/eyJhb.eyJldg.s1gn.ics'

const event = {
  id: 42,
  title: 'Evening Meditation',
  schedule,
  location: '5 Market St, Prague',
  url: 'https://atlas.example/e/42',
  calendarFeedUrl: FEED,
}

const hrefs = (input: Parameters<typeof calendarLinkTargets>[0]) =>
  calendarLinkTargets(input)
    .map(({ href }) => href)
    .join('\n')

const labels = (input: Parameters<typeof calendarLinkTargets>[0]) =>
  calendarLinkTargets(input).map(({ label }) => label)

describe('AddToCalendar', () => {
  // The menu's rows live in a Radix portal, which SSR does not render, so the trigger is
  // asserted here and the rows through `calendarLinkTargets`, the list they map over.
  it('renders one closed menu trigger, not a row of providers', () => {
    const html = renderToStaticMarkup(<AddToCalendar event={event} />)

    expect(html).toContain('Add to calendar')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).not.toContain('calendar.google.com')
    expect(html).not.toContain('webcal:')
  })

  it('offers the five providers in menu order, Apple first', () => {
    expect(labels(event)).toEqual([
      'Apple Calendar',
      'Google Calendar',
      'Outlook.com',
      'Office 365',
      'Yahoo',
    ])
  })

  it('offers every provider its own address', () => {
    const all = hrefs(event)

    expect(all).toContain('webcal://cloud.sydevelopers.com/api/events/calendar/')
    expect(all).toContain('calendar.google.com/calendar/r?cid=webcal%3A%2F%2F')
    expect(all).toContain('outlook.live.com/calendar/0/deeplink/compose')
    expect(all).toContain('outlook.office.com/calendar/0/deeplink/compose')
    expect(all).toContain('calendar.yahoo.com')
    // The template link Google used to get added one event the viewer then owned
    // a copy of, so a cancelled session stayed with them for good.
    expect(all).not.toContain('calendar/render')
    expect(all).not.toContain('action=TEMPLATE')
  })

  /**
   * A subscribe row with no address to subscribe to cannot work, and an inert menu entry
   * reads as a broken one. The three single-session rows compose their own URL from the
   * schedule, so they must survive — dropping them would retire working rows for nothing.
   */
  it('drops only the two subscribing rows for a class with no feed address', () => {
    for (const address of [null, undefined]) {
      expect(labels({ ...event, calendarFeedUrl: address })).toEqual([
        'Outlook.com',
        'Office 365',
        'Yahoo',
      ])
    }
  })

  it('sends the recurrence-less providers the NEXT session, not the 2019 start', () => {
    const all = hrefs(event)

    // Outlook and Yahoo take no recurrence parameter, so they get one
    // occurrence. The series began in 2019. A link carrying that date
    // would be useless.
    expect(all).toContain('startdt=2026-07-22T17%3A30%3A00.000Z')
    expect(all).toContain('st=20260722T173000Z')
    expect(all).not.toContain('startdt=2019')
    expect(all).not.toContain('st=2019')
  })

  // The URL shapes themselves belong to `src/lib/ics.test.ts`. This pins the wiring:
  // that `from` reaches the right builder per provider.
  it('anchors the recurrence-less providers on the registered session when given', () => {
    const all = hrefs({ ...event, from: new Date('2026-08-05T17:30:00Z') })

    expect(all).toContain('startdt=2026-08-05T17%3A30%3A00.000Z')
    // The two subscribing rows carry no anchor to move: their address is the
    // feed's, which lists every session. Compared per row, since the Outlook rows
    // in the same list legitimately do carry the date.
    const anchored = calendarLinkTargets({ ...event, from: new Date('2026-08-05T17:30:00Z') })
    const plain = calendarLinkTargets(event)

    for (const index of [0, 1]) {
      expect(anchored[index]!.href).toBe(plain[index]!.href)
      expect(anchored[index]!.href).not.toContain('2026-08-05')
    }
  })
})
