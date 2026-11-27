import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { EventListItem } from './EventListItem'

import { mockEventSlim } from '@/mocks/events'
import { countResolves } from '@/test-support/count-resolves'

// The card's facts and chips render for real here, over the one resolve the card hands them.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageCode: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ highlightEvent: () => {} }),
}))
vi.mock('@/hooks/use-prefetch-event', () => ({
  useHoverPrefetch: () => ({ enter: () => {}, leave: () => {} }),
}))

let resolves: ReturnType<typeof countResolves>

beforeEach(() => {
  resolves = countResolves()
})
afterEach(() => resolves.restore())

it('resolves a list card once, for its facts and its chips together', () => {
  renderToStaticMarkup(
    <MemoryRouter>
      <EventListItem event={mockEventSlim} />
    </MemoryRouter>,
  )

  expect(resolves.count).toBe(1)
})
