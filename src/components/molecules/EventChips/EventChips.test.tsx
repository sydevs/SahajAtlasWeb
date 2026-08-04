import type { EventChipsProps } from './EventChips'

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventChips } from './EventChips'

// Drive the display resolver + locale by hand so the test exercises the chip
// variant/filter logic, not the display derivation. The UI language is `en`;
// `languageLabel` echoes the code so the combined language text is greppable.
const { d } = vi.hoisted(() => ({
  d: { status: 'upcoming', full: false, typeLabel: 'Weekly class', isDefaultType: true },
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ languageCode: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('@/hooks/use-event-display', () => ({
  useEventDisplay: () => ({
    display: { status: d.status, full: d.full },
    typeLabel: d.typeLabel,
    isDefaultType: d.isDefaultType,
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
    d.typeLabel = 'Weekly class'
    d.isDefaultType = true
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
    d.isDefaultType = false
    d.typeLabel = 'Course'

    const html = render(['en', 'fr'], 'compact')

    expect(html).toContain('Course')
    expect(html).toContain('>fr<')
    expect(html).not.toContain('en, fr')
  })

  it('shows a contrast "Today" chip when the event is today', () => {
    d.status = 'today'

    const html = render(['en'])

    expect(html).toContain('display.chip_today')
    expect(html).toContain('text-contrast-11')
  })

  it('shows a "Full" chip when the event is at capacity', () => {
    d.full = true

    const html = render(['en'])

    expect(html).toContain('display.chip_full')
  })

  it('"Full" supersedes "Today" — only one availability chip renders', () => {
    d.full = true
    d.status = 'today'

    const html = render(['en'])

    expect(html).toContain('display.chip_full')
    expect(html).not.toContain('display.chip_today')
  })

  it('compact: a "Full" chip alone is enough to render the row', () => {
    d.full = true

    // Plain weekly type + viewer language are both trimmed in compact, so the
    // row would otherwise be empty.
    expect(render(['en'], 'compact')).toContain('display.chip_full')
  })
})
