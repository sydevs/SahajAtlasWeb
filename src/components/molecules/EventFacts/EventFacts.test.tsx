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
const NOT_PANEL = [
  ['the list card', 'compact'],
  ['the share and registration summaries', 'card'],
] as const

describe('EventFacts — the room line (#316)', () => {
  it('shows the room on the panel, on its own line above the street', () => {
    const html = renderToStaticMarkup(<EventFacts event={withRoom} />)
    const street = mockEvent.address?.street ?? ''

    expect(street).not.toBe('')
    expect(html).toContain(`<div>${roomLine}</div><div><button`)
    expect(html).toContain(`<span>${street}`)
  })

  it('hangs the pin from the first line when the room stacks it', () => {
    const stacked = renderToStaticMarkup(<EventFacts event={withRoom} />)
    const single = renderToStaticMarkup(<EventFacts event={mockEvent} />)
    // The location fact is the last item, so its alignment is the last one rendered.
    const pinItem = (html: string) => [...html.matchAll(/items-(start|center)/g)].at(-1)?.[0]

    expect(pinItem(stacked)).toBe('items-start')
    expect(pinItem(single)).toBe('items-center')
  })

  it.each(NOT_PANEL)('leaves %s without it', (_, variant) => {
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

describe('EventFacts — the address', () => {
  const full = '5 Market St, Cambridge CB2 3QJ'

  it('makes the class page address, postcode included, a copy button', () => {
    const html = renderToStaticMarkup(<EventFacts event={mockEvent} />)

    expect(html).toContain(`aria-label="event.a11y.copy_address: ${full}"`)
    expect(html).toContain(`<span>${full}</span>`)
    // A tap with a little movement would otherwise start a sheet drag and lose the click.
    expect(html).toMatch(
      /<button data-vaul-no-drag="true"[^>]*aria-label="event\.a11y\.copy_address/,
    )
  })

  it.each(NOT_PANEL)('keeps %s to plain street and town', (_, variant) => {
    const html = renderToStaticMarkup(<EventFacts event={mockEvent} variant={variant} />)

    expect(html).toContain('5 Market St, Cambridge')
    expect(html).not.toContain('CB2 3QJ')
    expect(html).not.toContain('<button')
  })

  it.each([
    ['an online class', mockEventSlimOnline],
    ['an inactive listing', mockEventInactive],
  ])('gives %s no copy button', (_, event) => {
    const html = renderToStaticMarkup(<EventFacts event={event} />)

    expect(html).not.toContain('<button')
    expect(html).not.toContain('CB2 3QJ')
  })
})
