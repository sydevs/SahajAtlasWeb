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
vi.mock('@/hooks/use-ip-location', () => ({
  useIpLocation: () => null,
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
