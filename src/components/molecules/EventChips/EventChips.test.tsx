import type { EventChipsProps } from './EventChips'

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventChips } from './EventChips'

// This drives the display resolver and locale by hand, so the test
// exercises the chip variant and filter logic, not the display derivation.
// The UI language is `en`. `languageLabel` echoes the code, so the
// combined language text is greppable.
const { d } = vi.hoisted(() => ({
  d: { status: 'upcoming', full: false, kind: 'class', typeLabel: 'Weekly class' },
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ languageCode: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('@/hooks/use-event-display', () => ({
  useEventDisplay: () => ({
    display: { status: d.status, full: d.full, kind: d.kind },
    typeLabel: d.typeLabel,
  }),
}))

const render = (languages: string[], variant?: EventChipsProps['variant']) =>
  renderToStaticMarkup(
    <EventChips event={{ languages } as unknown as EventChipsProps['event']} variant={variant} />,
  )

describe('EventChips', () => {
  beforeEach(() => {
    d.status = 'upcoming'
    d.full = false
    d.kind = 'class'
    d.typeLabel = 'Weekly class'
  })

  it('default: names the type and folds every language into one chip', () => {
    const html = render(['en', 'fr'])

    expect(html).toContain('Weekly class')
    expect(html).toContain('en, fr')
  })

  it('compact: drops the plain weekly type and the viewer language (renders nothing)', () => {
    expect(render(['en'], 'compact')).toBe('')
  })

  it('compact: keeps a non-default type and only the non-UI languages', () => {
    d.kind = 'course'
    d.typeLabel = 'Course'

    const html = render(['en', 'fr'], 'compact')

    expect(html).toContain('Course')
    expect(html).toContain('>fr<')
    expect(html).not.toContain('en, fr')
  })

  it('compact: leaves "Today" to the card facts, which already say it', () => {
    d.status = 'today'

    expect(render(['en'], 'compact')).toBe('')
  })

  it('compact: drops a monthly class type, which restates the recurrence line', () => {
    d.typeLabel = 'Monthly class'

    expect(render(['en'], 'compact')).toBe('')
  })

  it('compact: drops a language the title already names', () => {
    const event = { languages: ['fr'], title: 'Meditation in FR' }

    expect(
      renderToStaticMarkup(
        <EventChips event={event as unknown as EventChipsProps['event']} variant="compact" />,
      ),
    ).toBe('')
  })

  it('shows a tinted "Today" chip when the event is today', () => {
    d.status = 'today'

    const html = render(['en'])

    expect(html).toContain('event.display.chip_today')
    expect(html).toContain('text-primary-12')
  })

  it('shows a "Full" chip when the event is at capacity', () => {
    d.full = true

    const html = render(['en'])

    expect(html).toContain('event.display.chip_full')
  })

  it('"Full" supersedes "Today" — only one availability chip renders', () => {
    d.full = true
    d.status = 'today'

    const html = render(['en'])

    expect(html).toContain('event.display.chip_full')
    expect(html).not.toContain('event.display.chip_today')
  })

  it('compact: a "Full" chip alone is enough to render the row', () => {
    d.full = true

    // The plain weekly type and the viewer language are both trimmed in
    // compact. So the row would otherwise be empty.
    expect(render(['en'], 'compact')).toContain('event.display.chip_full')
  })
})
