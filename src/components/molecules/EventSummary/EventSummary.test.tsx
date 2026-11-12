import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { EventSummary } from './EventSummary'

import { mockEvent, mockEventSlimOnline } from '@/mocks/events'

// Node-only SSR, as `EventFacts.test.tsx` does it: the real facts and chips render, with `t`
// echoing each key.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageCode: 'en', languageLabel: (code: string) => code }),
}))

const DISTANCE = '3.6 km from Prague'

describe('EventSummary', () => {
  it('clamps the title in a list, and shows it whole in a box', () => {
    const row = renderToStaticMarkup(<EventSummary event={mockEvent} />)
    const boxed = renderToStaticMarkup(<EventSummary boxed event={mockEvent} />)

    expect(row).toContain('line-clamp-2')
    expect(row).not.toContain('rounded-lg')
    expect(boxed).not.toContain('line-clamp-2')
    expect(boxed).toContain('rounded-lg')
    expect(boxed).toContain(mockEvent.title)
  })

  // Devindra (12 Nov): an inactive listing is "Meditation in <City>" on every surface, the Share
  // and sign-up summaries included.
  it('names an inactive listing by its town, not the title its host typed', () => {
    const html = renderToStaticMarkup(
      <EventSummary
        boxed
        event={{ ...mockEvent, title: 'Meditation at 50 Murray Pl', inactive: true }}
      />,
    )

    expect(html).toContain('event.display.inactive_title')
    expect(html).not.toContain('Murray Pl')
  })

  it('tags an online class after its title', () => {
    const html = renderToStaticMarkup(<EventSummary event={mockEventSlimOnline} />)

    expect(html.indexOf('event.display.online')).toBeGreaterThan(
      html.indexOf(mockEventSlimOnline.title),
    )
    expect(renderToStaticMarkup(<EventSummary event={mockEvent} />)).not.toContain(
      'event.display.online<',
    )
  })

  // Above the registration form the distance means nothing: there is no searched place.
  it('drops the muted second lines when asked', () => {
    expect(renderToStaticMarkup(<EventSummary distance={DISTANCE} event={mockEvent} />)).toContain(
      DISTANCE,
    )
    expect(
      renderToStaticMarkup(<EventSummary hideSubtext distance={DISTANCE} event={mockEvent} />),
    ).not.toContain(DISTANCE)
  })
})
