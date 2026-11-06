import type { ListingDraft, PickedPlace } from '@/lib/proposal'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { PlaceStep } from './PlaceStep'

import { emptyDraft } from '@/lib/proposal'
import copy from '@/config/translations.en.json'

// The geocoder is Mapbox's own element; a marker in its place shows whether it would mount.
vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => <input data-geocoder="" /> }))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))

const found: PickedPlace = {
  label: '1 High Street, Oxford, United Kingdom',
  street: '1 High Street',
  city: 'Oxford',
  latitude: 51.75,
  longitude: -1.25,
  location: { placeId: 'cGxhY2U' },
}

const render = (draft: ListingDraft, search: boolean) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <PlaceStep
          draft={draft}
          errors={{}}
          search={search}
          showMap={false}
          onChange={() => {}}
          onEdit={() => () => {}}
          onPick={() => () => {}}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  )

describe('PlaceStep in a map-less embed', () => {
  it('searches Mapbox for the address when the embed has a map', () => {
    const markup = render(emptyDraft('Europe/London'), true)

    expect(markup).toContain('data-geocoder')
    expect(markup).toContain(copy.submit.where.manual_toggle)
  })

  it('asks for the address typed in instead, with no Mapbox search and no way back to one', () => {
    const markup = render(emptyDraft('Europe/London'), false)

    expect(markup).not.toContain('data-geocoder')
    expect(markup).toContain('id="submit-street"')
    expect(markup).not.toContain(copy.submit.where.manual_back)
  })

  it('asks for an online class’s city typed in', () => {
    const markup = render({ ...emptyDraft('Europe/London'), eventType: 'online' }, false)

    expect(markup).not.toContain('data-geocoder')
    expect(markup).toContain('id="submit-city"')
    expect(markup).not.toContain(copy.submit.where.manual_city_back)
  })

  it('keeps a correction’s published address as it is, until it is changed', () => {
    const markup = render({ ...emptyDraft('Europe/London'), address: found }, false)

    expect(markup).not.toContain('data-geocoder')
    expect(markup).toContain('1 High Street')
    expect(markup).not.toContain('id="submit-street"')
  })
})
