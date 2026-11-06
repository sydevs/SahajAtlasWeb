import type { EventChipsProps } from './EventChips'

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventChips } from './EventChips'

// This drives the display resolver and locale by hand, so the test
// exercises the chip variant and filter logic, not the display derivation.
// The UI language is `en`. `languageLabel` echoes the code, so the
// combined language text is greppable.
const { d } = vi.hoisted(() => ({
  d: {
    status: 'upcoming',
    kind: 'class',
    full: false,
    registration: 'open',
    typeLabel: 'Weekly class',
    isDefaultType: true,
    recurrenceLine: 'Every Wednesday' as string | null,
    online: false,
  },
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ languageCode: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('@/hooks/use-event-display', () => ({
  useEventDisplay: () => ({
    display: {
      status: d.status,
      kind: d.kind,
      full: d.full,
      registration: d.registration,
      online: d.online,
    },
    typeLabel: d.typeLabel,
    isDefaultType: d.isDefaultType,
    recurrenceLine: d.recurrenceLine,
  }),
}))

const render = (languages: string[], variant?: EventChipsProps['variant']) =>
  renderToStaticMarkup(
    <EventChips event={{ languages } as unknown as EventChipsProps['event']} variant={variant} />,
  )

describe('EventChips', () => {
  beforeEach(() => {
    d.status = 'upcoming'
    d.kind = 'class'
    d.full = false
    d.registration = 'open'
    d.typeLabel = 'Weekly class'
    d.isDefaultType = true
    d.recurrenceLine = 'Every Wednesday'
    d.online = false
  })

  // The card has its own Online tag beside the title, so the tag group would say it twice.
  it('default: leads an online class page with the soft teal Online tag; compact does not', () => {
    d.online = true

    const html = render(['en'])

    expect(html).toContain('event.display.online')
    expect(html).toContain('bg-primary-3')
    expect(html.indexOf('event.display.online')).toBeLessThan(html.indexOf('Weekly class'))
    expect(render(['en'], 'compact')).not.toContain('event.display.online')
  })

  it('default: an online by-request class still shows its tag group', () => {
    d.online = true
    d.status = 'inactive'
    d.kind = 'oneoff'

    expect(render([])).toContain('event.display.online')
  })

  it('default: an in-person class has no Online tag', () => {
    expect(render(['en'])).not.toContain('event.display.online')
  })

  it('default: names the type and folds every language into one chip', () => {
    const html = render(['en', 'fr'])

    expect(html).toContain('Weekly class')
    expect(html).toContain('en, fr')
  })

  it('default: marks the row for the phone sheet to fit above Register; compact does not', () => {
    d.isDefaultType = false

    expect(render(['fr'])).toContain('data-sheet-fold')
    expect(render(['fr'], 'compact')).not.toContain('data-sheet-fold')
  })

  it('compact: drops the plain weekly type and the viewer language (renders nothing)', () => {
    expect(render(['en'], 'compact')).toBe('')
  })

  it('compact: keeps a non-default type and only the non-UI languages', () => {
    d.isDefaultType = false
    d.typeLabel = 'Course'

    const html = render(['en', 'fr'], 'compact')

    expect(html).toContain('Course')
    expect(html).toContain('>fr<')
    expect(html).not.toContain('en, fr')
  })

  it('shows a contrast "Today" chip on a weekly card when the event is today', () => {
    d.status = 'today'

    const html = render(['en'], 'compact')

    expect(html).toContain('event.display.chip_today')
    expect(html).toContain('text-contrast-11')
  })

  it('leaves "Today" to the when line on the class page, and to a one-off card\'s lead line', () => {
    d.status = 'today'

    expect(render(['en'])).not.toContain('event.display.chip_today')

    d.recurrenceLine = null
    d.isDefaultType = false
    d.typeLabel = 'One-off event'
    expect(render(['en'], 'compact')).not.toContain('event.display.chip_today')
  })

  it('never calls a by-request class a one-off', () => {
    d.status = 'inactive'
    d.kind = 'oneoff'
    d.isDefaultType = false
    d.typeLabel = 'One-off event'

    expect(render(['en'])).not.toContain('One-off event')
    expect(render(['fr'], 'compact')).not.toContain('One-off event')
    // The language still shows.
    expect(render(['en'])).toContain('>en<')
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

  it('compact: a started course says Registration closed, in place of Full or Today', () => {
    d.registration = 'closed'
    d.status = 'today'
    d.full = true

    const html = render(['en'], 'compact')

    expect(html).toContain('event.display.registration_closed')
    expect(html).not.toContain('event.display.chip_full')
    expect(html).not.toContain('event.display.chip_today')
  })

  it('default: the class page leaves it to the Register button', () => {
    d.registration = 'closed'

    expect(render(['en'])).not.toContain('event.display.registration_closed')
  })
})
