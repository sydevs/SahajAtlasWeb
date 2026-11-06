import type { Event } from '@/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { EventActions } from './EventActions'

import { mockEvent } from '@/mocks/events'

// The key, with any interpolation appended, so a label shows which copy it asked for.
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))
// A pointer device: Contact is the popover. Touch dials `tel:` and never shows the copy field.
vi.mock('@/config/responsive', () => ({ useCoarsePointer: () => false }))

const render = (event: Event) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <EventActions basePath={`/demo/${event.id}`} event={event} />
    </MemoryRouter>,
  )

const directionsHref = (html: string) =>
  /href="(https:\/\/[^"]*maps[^"]*)"/.exec(html)?.[1]?.replace(/&amp;/g, '&')

describe('EventActions — Directions', () => {
  it('leads to the venue’s own coordinates when its address is a real place', () => {
    const html = render(mockEvent)

    expect(directionsHref(html)).toContain('52.2053,0.1218')
    expect(html).toContain('>event.actions.directions<')
  })

  // Sneek's host typed only the town, so its stored point is the town centre's (Browser H2).
  it('leads to the town by name for a guessed point, and says where', () => {
    const html = render({
      ...mockEvent,
      address: { street: 'Sneek', city: 'Sneek', country: 'NL', latitude: 53.03, longitude: 5.66 },
    })
    const href = directionsHref(html)

    expect(href).toContain(encodeURIComponent('Sneek, NL'))
    expect(href).not.toContain('53.03')
    expect(html).toContain('event.actions.directions_to:{&quot;place&quot;:&quot;Sneek&quot;}')
  })
})
