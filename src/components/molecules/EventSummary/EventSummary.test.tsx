import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { EventSummary, type EventSummaryProps } from './EventSummary'

import { EventFacts } from '@/components/molecules/EventFacts'
import { useEventDisplay } from '@/hooks/use-event-display'
import { mockEvent, mockEventSlimOnline } from '@/mocks/events'

// Node-only SSR, as `EventFacts.test.tsx` does it: the real facts and chips render, with `t`
// echoing each key.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageCode: 'en', languageLabel: (code: string) => code }),
}))

const DISTANCE = '3.6 km from Cambridge'

// The parent resolves the display once and hands it down; this stands in for that parent.
const Summary = ({ event, ...props }: Omit<EventSummaryProps, 'strings'>) => (
  <EventSummary {...props} event={event} strings={useEventDisplay(event)} />
)

const PageFacts = () => <EventFacts strings={useEventDisplay(mockEvent)} />

describe('EventSummary', () => {
  it('clamps the title in a list, and shows it whole in a box', () => {
    const row = renderToStaticMarkup(<Summary event={mockEvent} />)
    const boxed = renderToStaticMarkup(<Summary boxed event={mockEvent} />)

    expect(row).toContain('line-clamp-2')
    expect(row).not.toContain('bg-gray-2')
    expect(boxed).not.toContain('line-clamp-2')
    expect(boxed).toContain('bg-gray-2')
    expect(boxed).toContain(mockEvent.title)
  })

  it('tags an online class after its title', () => {
    const html = renderToStaticMarkup(<Summary event={mockEventSlimOnline} />)
    const tag = html.indexOf('>event.display.online<')

    expect(tag).toBeGreaterThan(html.indexOf(mockEventSlimOnline.title))
    expect(renderToStaticMarkup(<Summary event={mockEvent} />)).not.toContain(
      '>event.display.online<',
    )
  })

  // The list card's facts, boxed or not: no "Next session" line, which the class page carries.
  it('reads the list card facts', () => {
    expect(renderToStaticMarkup(<PageFacts />)).toContain('event.display.next_session')
    expect(renderToStaticMarkup(<Summary boxed event={mockEvent} />)).not.toContain(
      'event.display.next_session',
    )
  })

  it('drops the faded second lines when asked', () => {
    expect(renderToStaticMarkup(<Summary distance={DISTANCE} event={mockEvent} />)).toContain(
      DISTANCE,
    )
    expect(
      renderToStaticMarkup(<Summary hideSubtext distance={DISTANCE} event={mockEvent} />),
    ).not.toContain(DISTANCE)
  })
})
