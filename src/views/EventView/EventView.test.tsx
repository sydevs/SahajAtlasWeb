import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventView } from './EventView'

import { eventQuery } from '@/config/api'
import { mockEvent } from '@/mocks/events'

// The class page's correction offer (#147) lives at the route, below the lazy panel, so it
// renders whether or not the panel's chunk has loaded — which under SSR it never has.
const livePreview = vi.hoisted(() => ({ active: false }))

vi.mock('@/config/live-preview/protocol', () => ({ default: livePreview }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: 'en',
    languageCode: 'en',
    languageLabel: (code: string) => code,
  }),
}))
vi.mock('@/hooks/use-ip-location', () => ({ useIpLocation: () => null }))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))
vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => null }))

const render = () => {
  const client = new QueryClient()

  client.setQueryData(eventQuery(mockEvent.id, 'en').queryKey, mockEvent)

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EventView basePath="/gb/oxford/507" id={mockEvent.id} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EventView', () => {
  beforeEach(() => {
    livePreview.active = false
  })

  it('offers a correction to the class it shows', () => {
    const markup = render()

    expect(markup).toContain('submit.chrome.correct_entry')
    expect(markup).toMatch(/href="[^"]*\/gb\/oxford\/507\/correct"/)
  })

  it('never on a reviewer’s live preview, which is not yet a class anyone could correct', () => {
    livePreview.active = true

    expect(render()).not.toContain('submit.chrome.correct_entry')
  })
})
