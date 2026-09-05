import type { EventSchedule } from '@/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { AddToCalendar } from './AddToCalendar'

// Mock the i18n boundary, so the accessible name renders as real copy
// without booting i18next (the ShareContent/GeolocationPrompt template).
// This is the node lane, with no jsdom. See docs/testing.md.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'actions.download_ics' ? 'Download .ics file' : key),
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

// The rendered markup HTML-escapes query separators. So assert against a
// decoded copy. Otherwise every `&` is `&amp;`, and the assertions read as
// noise.
const render = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(node)
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")

describe('AddToCalendar', () => {
  it('offers all five providers', () => {
    const html = render(<AddToCalendar event={event} />)

    expect(html).toContain('calendar.google.com/calendar/render')
    expect(html).toContain('outlook.live.com/calendar/0/deeplink/compose')
    expect(html).toContain('outlook.office.com/calendar/0/deeplink/compose')
    expect(html).toContain('calendar.yahoo.com')
    // Apple is the .ics download: a button, not a link, because it synthesises
    // a file, instead of navigating.
    expect(html).toContain('Apple')
  })

  it('names the .ics control so its purpose survives the brand label', () => {
    const html = render(<AddToCalendar event={event} />)

    // WCAG 2.5.3: the accessible name must CONTAIN the visible label, so a voice
    // user saying "click Apple" still matches.
    expect(html).toContain('aria-label="Apple · Download .ics file"')
  })

  it('opens the link-outs in a new tab without leaking the opener', () => {
    const html = render(<AddToCalendar event={event} />)

    expect(html).not.toContain('rel="noopener noreferrer" target="_blank" href="https://calendar')
    for (const fragment of html.split('<a ').slice(1)) {
      expect(fragment).toContain('target="_blank"')
      expect(fragment).toContain('noopener')
    }
  })

  it('sends the recurrence-less providers the NEXT session, not the 2019 start', () => {
    const html = render(<AddToCalendar event={event} />)

    // Outlook and Yahoo take no recurrence parameter, so they get one
    // occurrence. The series began in 2019. A link carrying that date
    // would be useless.
    expect(html).toContain('startdt=2026-07-22T17%3A30%3A00.000Z')
    expect(html).toContain('st=20260722T173000Z')
    // This scopes to those two params, NOT the whole document. Google's
    // `dates` legitimately stays the 2019 series anchor, because it
    // carries the RRULE.
    expect(html).not.toContain('startdt=2019')
    expect(html).not.toContain('st=2019')
  })

  // What this spec asserts HERE is the wiring: that `event`, including
  // `from`, reaches the right builder per button. The URL shapes themselves
  // belong to `src/lib/ics.test.ts`, which pins them against a parsed `URL`,
  // instead of a decoded markup string.
  it('anchors the recurrence-less providers on the registered session when given', () => {
    const html = render(
      <AddToCalendar event={{ ...event, from: new Date('2026-08-05T17:30:00Z') }} />,
    )

    expect(html).toContain('startdt=2026-08-05T17%3A30%3A00.000Z')
    // Google stays on the series anchor. `from` must not move a DTSTART the
    // RRULE counts from.
    expect(html).toContain('dates=20190102T193000%2F20190102T204500')
  })
})
