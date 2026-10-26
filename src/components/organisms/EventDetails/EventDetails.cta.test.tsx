import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { EventDetails } from './EventDetails'

import { mockEvent } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`). Register and the action row travel
// together: the mobile map sheet pins its footer over the body's last band, so an inline
// copy of either is drawn underneath it at the 300px snap (#320). Measured there at
// 390×844, the four circles straddled the bar's top edge — icons above it, labels and tap
// areas beneath.
//
// ⚠ Both stubs render a MARKER, not null. `not.toContain` against a null stub passes
// whether or not the component was called, which is how this spec would go vacuous.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageCode: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('@/hooks/use-ip-location', () => ({
  useIpLocation: () => null,
}))
vi.mock('./EventRegister', () => ({
  EventRegisterBar: () => <i>register-slot</i>,
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

const panel = (ctaInline?: boolean) =>
  renderToStaticMarkup(
    <EventDetails basePath="/gb/london/1" ctaInline={ctaInline} event={mockEvent} />,
  )

describe('EventDetails — where the calls to action render', () => {
  it('renders both inline by default, in panel order', () => {
    const markup = panel()

    expect(markup).toContain('register-slot')
    expect(markup).toContain('actions-slot')
    expect(markup.indexOf('register-slot')).toBeLessThan(markup.indexOf('actions-slot'))
  })

  it('renders neither when the sticky footer owns them', () => {
    const markup = panel(false)

    expect(markup).not.toContain('register-slot')
    expect(markup).not.toContain('actions-slot')
  })

  // The rest of the panel is unaffected, so a reader who drags the sheet up still gets
  // the facts and the prose. Without this, "renders neither" also passes for a panel
  // that rendered nothing at all.
  it('keeps the rest of the panel when the footer owns them', () => {
    const markup = panel(false)

    expect(markup).toContain('facts-slot')
    expect(markup).toContain('chips-slot')
  })
})
