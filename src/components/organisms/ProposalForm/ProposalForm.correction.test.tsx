import type { Event } from '@/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { ProposalForm } from './ProposalForm'

import { emptyDraft } from '@/lib/proposal'
import { EMPTY_SENDER } from '@/config/store'
import { mockEvent, mockEventInactive } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`): the line under "Suggest a correction" that
// names the class being corrected.
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, options?: { city?: string }) =>
      key === 'event.display.inactive_title' ? `Meditation in ${options?.city}` : key,
  }),
}))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en', languageCode: 'en' }) }))
vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => null }))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))

const header = (event: Event) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ProposalForm
          context={{ path: '/add', pageUrl: 'https://host.example', locale: 'en', userAgent: 'x' }}
          correction={{ eventId: event.id, baseDraft: emptyDraft('Europe/London'), event }}
          draft={emptyDraft('Europe/London')}
          sender={EMPTY_SENDER}
          sent={false}
          step="fix"
          onChange={() => {}}
          onClose={() => {}}
          onSender={() => {}}
          onSent={() => {}}
          onStep={() => {}}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  ).match(/<p class="line-clamp-2[^"]*">([^<]*)<\/p>/)?.[1]

describe('ProposalForm — the class a correction is for', () => {
  it('names an inactive listing by its town, never its host’s own title', () => {
    expect(header(mockEventInactive)).toBe(`Meditation in ${mockEventInactive.address?.city}`)
  })

  it('names any other class by its own title', () => {
    expect(header(mockEvent)).toBe(mockEvent.title)
  })
})
