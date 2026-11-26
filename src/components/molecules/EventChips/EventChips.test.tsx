import type { EventChipsProps } from './EventChips'
import type { EventSurfaceView } from '@/hooks/use-event-display'

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventChips } from './EventChips'

// Which chips a surface shows is `surfaceView`'s decision, specced beside it. This drives the
// views by hand, so it covers only the rendering and the language filter. The UI language is
// `en`, and `languageLabel` echoes the code, so the combined language text is greppable.
const { views } = vi.hoisted(() => ({
  views: {} as Record<'page' | 'card', Pick<EventSurfaceView, 'type' | 'availability'>>,
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ languageCode: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('@/hooks/use-event-display', () => ({
  useEventDisplay: () => ({ surfaces: views }),
}))

const render = (languages: string[], surface?: EventChipsProps['surface']) =>
  renderToStaticMarkup(
    <EventChips event={{ languages } as unknown as EventChipsProps['event']} surface={surface} />,
  )

describe('EventChips', () => {
  beforeEach(() => {
    views.page = { type: 'Weekly class', availability: null }
    views.card = { type: null, availability: null }
  })

  it('names the type and folds every language into one chip on the page', () => {
    const html = render(['en', 'fr'])

    expect(html).toContain('Weekly class')
    expect(html).toContain('en, fr')
  })

  it("leaves the viewer's own language off a card", () => {
    const html = render(['en', 'fr'], 'card')

    expect(html).toContain('>fr<')
    expect(html).not.toContain('en, fr')
  })

  it('renders nothing when a card has nothing to add', () => {
    expect(render(['en'], 'card')).toBe('')
  })

  it('renders "Full" neutral and "Today" in contrast', () => {
    views.card.availability = 'today'
    expect(render(['en'], 'card')).toContain('text-contrast-11')
    expect(render(['en'], 'card')).toContain('event.display.chip_today')

    views.card.availability = 'full'
    expect(render(['en'], 'card')).toContain('event.display.chip_full')
    expect(render(['en'], 'card')).not.toContain('event.display.chip_today')
  })

  it('renders no type chip where the view names none', () => {
    views.page.type = null

    expect(render(['en'])).not.toContain('text-primary-11')
    expect(render(['en'])).toContain('>en<')
  })
})
