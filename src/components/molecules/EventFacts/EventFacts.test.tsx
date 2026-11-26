import type { Event } from '@/types'

import { Settings } from 'luxon'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, it, expect, vi } from 'vitest'

import { EventFacts } from './EventFacts'

import { EventChips } from '@/components/molecules/EventChips'
import { mockEvent, mockEventInactive, mockEventSlimOnline } from '@/mocks/events'

// Node-only SSR, as `EventListItem.test.tsx` does it. `t` echoes the key with its
// `room` option, so the room line is distinguishable from the street line.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { room?: string }) =>
      options?.room ? `${key}:${options.room}` : key,
  }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageCode: 'en', languageLabel: (code: string) => code }),
}))

const ROOM = 'Community Hall B'
const withRoom = { ...mockEvent, address: { ...mockEvent.address, room: ROOM } }
const roomLine = `event.display.room:${ROOM}`

describe('EventFacts — the room line (#316)', () => {
  it('shows the room on the panel, on its own line above the street', () => {
    const html = renderToStaticMarkup(<EventFacts event={withRoom} />)
    const street = mockEvent.address?.street ?? ''

    expect(street).not.toBe('')
    expect(html).toContain(`<div>${roomLine}</div><div>${street}`)
  })

  it('hangs the pin from the first line when the room stacks it', () => {
    const stacked = renderToStaticMarkup(<EventFacts event={withRoom} />)
    const single = renderToStaticMarkup(<EventFacts event={mockEvent} />)
    // The location fact is the last item, so its alignment is the last one rendered.
    const pinItem = (html: string) => [...html.matchAll(/items-(start|center)/g)].at(-1)?.[0]

    expect(pinItem(stacked)).toBe('items-start')
    expect(pinItem(single)).toBe('items-center')
  })

  it.each([
    ['the list card', 'compact'],
    ['the share and registration summaries', 'card'],
  ] as const)('leaves %s without it', (_, variant) => {
    const html = renderToStaticMarkup(<EventFacts event={withRoom} variant={variant} />)

    expect(html).not.toContain('event.display.room')
  })

  it.each([
    ['a class with no room', { ...mockEvent, address: { ...mockEvent.address, room: null } }],
    ['a blank room', { ...mockEvent, address: { ...mockEvent.address, room: '  ' } }],
    [
      'an online class',
      { ...mockEventSlimOnline, address: { ...mockEventSlimOnline.address, room: ROOM } },
    ],
    [
      'an inactive listing',
      { ...mockEventInactive, address: { ...mockEventInactive.address, room: ROOM } },
    ],
  ])('adds no line for %s', (_, event) => {
    expect(renderToStaticMarkup(<EventFacts event={event} />)).not.toContain('event.display.room')
  })
})

// The card and the class page each pair these two, and each must say "Today" once.
describe('EventFacts with EventChips — "Today" once', () => {
  afterEach(() => {
    Settings.now = () => Date.now()
  })

  // Wednesday 15 July 2026: noon in London, and the class meets at 18:30.
  const weekly: Event = {
    ...mockEvent,
    registrationsFull: false,
    schedule: {
      firstDate: new Date('2026-07-01T17:30:00Z'),
      firstDate_tz: 'Europe/London',
      endTime: '20:00',
      recurrenceType: 'WEEKLY',
      interval: 1,
      weekdays: ['WE'],
      upcomingDates: [new Date('2026-07-15T17:30:00Z'), new Date('2026-07-22T17:30:00Z')],
    },
  }
  const oneOff: Event = {
    ...weekly,
    schedule: { ...weekly.schedule!, recurrenceType: null, weekdays: [] },
  }

  it.each([
    ['a weekly card, as its chip', weekly, 'compact'],
    ['a full weekly card, in its line', { ...weekly, registrationsFull: true }, 'compact'],
    ['a one-off card, in its line', oneOff, 'compact'],
    ['a weekly class page, in its line', weekly, 'default'],
    ['a one-off class page, in its line', oneOff, 'default'],
  ] as const)('on %s', (_, event, variant) => {
    Settings.now = () => Date.parse('2026-07-15T11:00:00Z')

    const html = renderToStaticMarkup(
      <>
        <EventFacts event={event} variant={variant} />
        <EventChips event={event} variant={variant} />
      </>,
    )

    expect(html.split('event.display.chip_today')).toHaveLength(2)
  })
})
