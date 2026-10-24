import type { GeocodingFeature } from '@mapbox/search-js-core'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { ProposalForm } from './ProposalForm'

import { emptyDraft } from '@/lib/proposal'
import { EMPTY_SENDER } from '@/config/store'
import { viewerTimeZone } from '@/lib/time'

// Picking a place is the geocoder's retrieve, stood in for here by capturing the callback the
// form hands it during render.
const geocoder = vi.hoisted(() => ({ retrieve: (_feature: unknown) => {} }))

vi.mock('@mapbox/search-js-react', () => ({
  Geocoder: ({ onRetrieve }: { onRetrieve: (feature: unknown) => void }) => {
    geocoder.retrieve = onRetrieve

    return null
  },
}))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))

const placeFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-150, -60] },
  properties: {
    mapbox_id: 'dXJuOm1ieGFkcjoxMjM0',
    feature_type: 'address',
    name: '1 Far Away Road',
    coordinates: { longitude: -150, latitude: -60 },
    context: {},
  },
} as unknown as GeocodingFeature

const pick = (zoneNearby: string | undefined) => {
  const onChange = vi.fn()

  renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ProposalForm
          context={{ path: '/add', pageUrl: 'https://host.example', locale: 'en', userAgent: 'x' }}
          draft={emptyDraft('Pacific/Kiritimati')}
          sender={EMPTY_SENDER}
          sent={false}
          step="where"
          timeZoneFor={() => zoneNearby}
          onChange={onChange}
          onClose={() => {}}
          onSender={() => {}}
          onSent={() => {}}
          onStep={() => {}}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  geocoder.retrieve(placeFeature)

  return onChange.mock.calls[0][0]
}

describe('ProposalForm picking a place', () => {
  it('takes the zone of a nearby class', () => {
    expect(pick('Europe/London').timeZone).toBe('Europe/London')
  })

  it('falls back to the visitor’s own zone, never a zone inferred for an earlier place', () => {
    expect(pick(undefined).timeZone).toBe(viewerTimeZone())
  })
})
