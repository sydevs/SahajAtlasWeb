import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { EventFacts } from './EventFacts'

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
  useLocale: () => ({ locale: 'en' }),
}))

const ROOM = 'Community Hall B'
const withRoom = { ...mockEvent, address: { ...mockEvent.address, room: ROOM } }
const roomLine = `event.display.room:${ROOM}`

describe('EventFacts — the room line (#316)', () => {
  it('leads with the room on the panel, with the street in the muted line under it', () => {
    const html = renderToStaticMarkup(<EventFacts event={withRoom} />)
    const street = mockEvent.address?.street ?? ''

    expect(street).not.toBe('')
    expect(html).toContain(`<div>${roomLine}</div><div class=`)
    expect(html).toMatch(new RegExp(`<div class="[^"]*text-gray-11[^"]*">${street}`))
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

// Anton (round 2): the address at the top made the class page heavy. The page shows the time at
// the top and the room and street under the actions, as two halves of this one block.
describe('EventFacts — split into when and where for the class page', () => {
  const street = mockEvent.address?.street ?? ''

  it('keeps the address out of the when half', () => {
    const html = renderToStaticMarkup(<EventFacts event={withRoom} part="when" />)

    expect(html).not.toContain(street)
    expect(html).not.toContain('event.display.room')
  })

  it('shows only the room and street in the where half', () => {
    const html = renderToStaticMarkup(<EventFacts event={withRoom} part="where" />)
    const both = renderToStaticMarkup(<EventFacts event={withRoom} />)

    expect(html).toContain(roomLine)
    expect(html).toContain(street)
    // One fact, not two: the calendar fact stays with the when half.
    expect(html.match(/<svg/g)).toHaveLength(1)
    expect(both.match(/<svg/g)).toHaveLength(2)
  })

  it('sizes the phone sheet to the when half only', () => {
    expect(renderToStaticMarkup(<EventFacts event={mockEvent} part="when" />)).toContain(
      'data-sheet-fold',
    )
    expect(renderToStaticMarkup(<EventFacts event={mockEvent} part="where" />)).not.toContain(
      'data-sheet-fold',
    )
  })

  it('keeps an online class whole in the when half, with nothing under the actions', () => {
    const when = renderToStaticMarkup(<EventFacts event={mockEventSlimOnline} part="when" />)

    expect(when).toContain('event.display.online')
    expect(renderToStaticMarkup(<EventFacts event={mockEventSlimOnline} part="where" />)).toBe('')
  })
})
