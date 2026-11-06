import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { EventDetails } from './EventDetails'

import { mockEvent } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`). Register and the action row travel
// together, because the mobile map sheet's footer is pinned over the body's last band
// (#320).
//
// ⚠ Every stub renders a MARKER, not null. `not.toContain` against a null stub passes
// whether or not the component was called, which is how this spec would go vacuous.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('./EventRegister', () => ({
  EventRegisterBar: () => <i>register-slot</i>,
  EventOnward: () => <i>onward-slot</i>,
}))
vi.mock('@/config/responsive', () => ({ useCoarsePointer: () => false }))
vi.mock('@/hooks/use-event-display', () => ({
  useEventDisplay: () => ({ display: { status: 'running', next: null } }),
}))
vi.mock('@/components/molecules/WhatToExpect', () => ({
  WhatToExpect: () => <i>expect-slot</i>,
}))
vi.mock('@/components/molecules/EventActions', () => ({
  EventActions: () => <i>actions-slot</i>,
}))
vi.mock('@/components/molecules/EventChips', () => ({
  EventChips: () => <i>chips-slot</i>,
}))
vi.mock('@/components/molecules/EventFacts', () => ({
  EventFacts: () => <i>facts-slot</i>,
}))
// DOMPurify binds a real `window` at module scope. `sanitize.test.ts` owns that allowlist.
vi.mock('./sanitize', () => ({
  sanitizeDescription: (html: string) => html,
}))

const panel = (cta?: React.ReactNode) =>
  renderToStaticMarkup(<EventDetails basePath="/gb/london/1" cta={cta} event={mockEvent} />)

/** Where each marker sits in the markup, so an order reads as a list of positions. */
const order = (markup: string, ...markers: string[]) => markers.map((m) => markup.indexOf(m))

const ascending = (positions: number[]) =>
  positions.every((at, i) => at >= 0 && (i === 0 || at > positions[i - 1]))

describe('EventDetails — where the calls to action render', () => {
  it('renders both inline by default, in panel order', () => {
    const markup = panel()

    expect(markup).toContain('register-slot')
    expect(markup).toContain('actions-slot')
    expect(markup.indexOf('register-slot')).toBeLessThan(markup.indexOf('actions-slot'))
  })

  it('offers no onward links on a class that can be booked', () => {
    expect(panel()).not.toContain('onward-slot')
  })

  // Anton's order: title, tags, time and place, Register, Directions/Share, Add to calendar,
  // What to expect, About. Reading and keyboard order are DOM order.
  it('puts Register and the actions after the tags and facts, before What to expect', () => {
    expect(
      ascending(
        order(panel(), 'chips-slot', 'facts-slot', 'register-slot', 'actions-slot', 'expect-slot'),
      ),
    ).toBe(true)
  })

  // The phone sheet's pinned bar paints at the screen's edge, but stands HERE in the DOM, so
  // a keyboard or screen reader reaches Register right after the time and place — not after
  // About, where a footer below the body put it.
  it('stands a caller’s bar in the same place, instead of the inline pair', () => {
    const markup = panel(<i>pinned-bar</i>)

    expect(markup).not.toContain('register-slot')
    expect(markup).not.toContain('actions-slot')
    expect(ascending(order(markup, 'chips-slot', 'facts-slot', 'pinned-bar', 'expect-slot'))).toBe(
      true,
    )
  })
})
