import type { GeocodingFeature, GeocodingOptions } from '@mapbox/search-js-core'
import type { ListingDraft } from '@/lib/proposal'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { ProposalForm } from './ProposalForm'

import { emptyDraft } from '@/lib/proposal'
import { EMPTY_SENDER } from '@/config/store'
import { viewerTimeZone } from '@/lib/time'

// Picking a place is the geocoder's retrieve, stood in for here by capturing the callback the
// form hands it during render, beside the options that become the Mapbox request.
const geocoder = vi.hoisted(() => ({
  retrieve: (_feature: unknown) => {},
  options: {} as Partial<GeocodingOptions>,
}))

vi.mock('@mapbox/search-js-react', () => ({
  Geocoder: ({
    onRetrieve,
    options,
  }: {
    onRetrieve: (feature: unknown) => void
    options: Partial<GeocodingOptions>
  }) => {
    geocoder.retrieve = onRetrieve
    geocoder.options = options

    return null
  },
}))
vi.mock('react-map-gl/mapbox', () => ({ useMap: () => ({}) }))

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

const renderWhere = (
  zoneNearby: string | undefined,
  onChange: (patch: Partial<ListingDraft>) => void,
  draft = emptyDraft('Pacific/Kiritimati'),
) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ProposalForm
          context={{ path: '/add', pageUrl: 'https://host.example', locale: 'en', userAgent: 'x' }}
          draft={draft}
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

const pick = (zoneNearby: string | undefined) => {
  const onChange = vi.fn()

  renderWhere(zoneNearby, onChange)
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

  // SahajCloud keeps the ids a proposal sends, and Mapbox allows storing one only from a
  // permanent lookup. The header field's half is `MapSearch.permanent.test.tsx`.
  it.each(['offline', 'online'] as const)('asks for a storable answer for an %s class', (type) => {
    renderWhere(undefined, () => {}, { ...emptyDraft('Pacific/Kiritimati'), eventType: type })

    expect(geocoder.options.permanent).toBe(true)
  })
})
