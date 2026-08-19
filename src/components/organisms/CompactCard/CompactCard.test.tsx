import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { CompactCard } from './CompactCard'

import { mockEventSlimList } from '@/mocks/events'

// Node-only SSR assertions (`.claude/rules/tests.md`). What matters about this card is what a
// visitor reads off it: the one control has to name the TASK rather than the product, both
// because that is the accessible name and because the atlas has to read as the host's own
// events feature (#158).
//
// `t` resolves through the real `en/common.json` rather than echoing keys back, so the
// assertions below are about the copy that actually ships — and a key deleted from the bundle
// fails here instead of rendering as its own dotted name on somebody's page.
const en = JSON.parse(readFileSync('public/locales/en/common.json', 'utf8'))
const copy = (key: string): string =>
  key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en) as string

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => copy(key) ?? key }),
}))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ highlightEvent: () => {} }),
}))
vi.mock('@/hooks/use-prefetch-event', () => ({
  useHoverPrefetch: () => ({ enter: () => {}, leave: () => {} }),
}))
vi.mock('@/components/molecules/EventFacts', () => ({ EventFacts: () => null }))
vi.mock('@/components/molecules/EventChips', () => ({ EventChips: () => null }))

const render = (events = mockEventSlimList) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <CompactCard events={events} onOpen={() => {}} />
    </MemoryRouter>,
  )

describe('CompactCard', () => {
  // One key for the phrase, shared with the widget landmark's accessible name — two keys
  // differing only in casing would drift across ten locales.
  it('names the content with the same key the widget landmark uses', () => {
    expect(render()).toContain(`>${copy('widget.label')}</h2>`)
  })

  // The whole point of the control, and the easiest thing in the app to reword into a
  // product name by accident.
  it('names its one control for the task, not the product', () => {
    const html = render()

    expect(html).toContain(copy('compact.open'))
    expect(html).toMatch(/find a class near you/i)
  })

  // The #158 ratchet, asserted where the copy is rather than only over the file.
  it('carries no brand name a visitor could read', () => {
    expect(render()).not.toMatch(/sahaj\s*atlas|we\s?meditate/i)
  })

  it('previews the classes it was given', () => {
    const html = render(mockEventSlimList.slice(0, 2))

    expect(html).toContain(mockEventSlimList[0]!.title)
    expect(html).toContain(mockEventSlimList[1]!.title)
  })

  // An empty feed is a legitimate state — a card with no rows is still a way in, and must
  // not render an empty list container around nothing.
  it('is still a way in with nothing to preview', () => {
    const html = render([])

    expect(html).toContain(copy('compact.open'))
    expect(html).not.toContain('<ul')
  })
})
