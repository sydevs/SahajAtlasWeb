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
    recurrenceLine: 'Every Wednesday',
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

  it('default: names a course and folds every language into one chip', () => {
    d.kind = 'course'
    d.typeLabel = 'Course'
    const html = render(['en', 'fr'])

    expect(html).toContain('Course')
    expect(html).toContain('en, fr')
  })

  it('default: drops a language the title already names', () => {
    const html = renderToStaticMarkup(
      <EventChips
        event={
          { languages: ['en'], title: 'Meditation in EN' } as unknown as EventChipsProps['event']
        }
      />,
    )

    expect(html).not.toContain('>en<')
  })

  it('default: keeps a language that only appears inside a longer word', () => {
    const html = renderToStaticMarkup(
      <EventChips
        event={
          {
            languages: ['en'],
            title: 'Meditation in Enfield',
          } as unknown as EventChipsProps['event']
        }
      />,
    )

    expect(html).toContain('>en<')
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

  it('shows no "Today" chip on a card: the card facts say it on their own line', () => {
    d.status = 'today'

    expect(render(['en'], 'compact')).not.toContain('event.display.chip_today')
  })

  it('leaves "Today" to the when line on the class page', () => {
    d.status = 'today'

    expect(render(['en'])).not.toContain('event.display.chip_today')
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
