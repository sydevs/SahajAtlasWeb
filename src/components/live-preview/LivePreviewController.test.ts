import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import { namesPreviewedDoc, writeEventEdit, writeRegionEdit } from './LivePreviewController'

import { eventQuery, regionQuery } from '@/config/api'
import { mockLeafRegion } from '@/mocks/regions'
import { EventDocSchema, RegionNodeSchema } from '@/types'

// The controller module builds its CMS origin at import time and pulls the SDK client in with
// it. Neither is exercised here — these two writers touch a QueryClient and nothing else — so
// the boundary is mocked exactly as `fetch.test.ts` mocks it.
vi.mock('@payloadcms/sdk', () => ({
  PayloadSDK: class {
    find = vi.fn()
    findByID = vi.fn()
    request = vi.fn()
  },
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'fr' } }))

/**
 * The live-edit cache writes, against a real QueryClient.
 *
 * ⚠ **The defect these cover was invisible to every other kind of test.** `setQueryData` under
 * a key nothing subscribes to succeeds: it creates the entry, returns nothing, and reports no
 * miss. So the whole live-edit pipeline shipped writing `['event', id]` and `['region', slug]`
 * while the drawers read the locale-suffixed keys, and not one edit ever rendered.
 * Each case therefore asserts the key a DRAWER would read, and the event one additionally
 * asserts the old key stays empty — a reader-side assertion alone would pass if a future
 * writer wrote to both.
 */
const LOCALE = 'fr'

const eventDoc = EventDocSchema.parse({
  id: 13,
  title: 'Voronezh Class',
  eventType: 'offline',
  languages: ['ru'],
  registrationMode: 'sahaj-atlas',
  region: { id: 5, slug: 'voronezh', level: 'city' },
  webPath: '/russia/voronezh/13',
})

let queryClient: QueryClient

beforeEach(() => {
  queryClient = new QueryClient()
})

describe('writeEventEdit', () => {
  it('lands on the locale-suffixed key EventView reads, and not the bare one', () => {
    writeEventEdit(queryClient, LOCALE, eventDoc)

    expect(queryClient.getQueryData(eventQuery(13, LOCALE).queryKey)).toMatchObject({
      id: 13,
      title: 'Voronezh Class',
    })
    expect(queryClient.getQueryData(['event', 13])).toBeUndefined()
  })

  it('writes the SHAPED event, not the raw document', () => {
    writeEventEdit(queryClient, LOCALE, eventDoc)

    // `path` exists only after shaping. A raw doc carries `webPath` and no `path` at all, so
    // this is what tells a passing seed apart from one the drawer cannot render.
    expect(queryClient.getQueryData(eventQuery(13, LOCALE).queryKey)).toHaveProperty(
      'path',
      '/russia/voronezh/13',
    )
  })

  it('keys each locale separately, so an edit cannot leak across a language switch', () => {
    writeEventEdit(queryClient, 'de', eventDoc)

    expect(queryClient.getQueryData(eventQuery(13, 'de').queryKey)).toBeDefined()
    expect(queryClient.getQueryData(eventQuery(13, 'fr').queryKey)).toBeUndefined()
  })
})

describe('writeRegionEdit', () => {
  const node = RegionNodeSchema.parse({
    id: 13,
    slug: mockLeafRegion.slug,
    name: 'Renamed Hall',
    subtitle: 'An edited subtitle',
    level: 'venue',
    parent: 28,
  })

  it('overlays the edited scalars onto the region the drawer already read', () => {
    queryClient.setQueryData(regionQuery(mockLeafRegion.slug, LOCALE).queryKey, mockLeafRegion)

    expect(writeRegionEdit(queryClient, LOCALE, mockLeafRegion.slug, node)).toBe(true)
    expect(
      queryClient.getQueryData(regionQuery(mockLeafRegion.slug, LOCALE).queryKey),
    ).toMatchObject({ name: 'Renamed Hall', subtitle: 'An edited subtitle' })
  })

  it('leaves the geojson-derived values alone — a form edit cannot move them', () => {
    queryClient.setQueryData(regionQuery(mockLeafRegion.slug, LOCALE).queryKey, mockLeafRegion)
    writeRegionEdit(queryClient, LOCALE, mockLeafRegion.slug, node)

    expect(
      queryClient.getQueryData(regionQuery(mockLeafRegion.slug, LOCALE).queryKey),
    ).toMatchObject({
      name: 'Renamed Hall',
      bounds: mockLeafRegion.bounds,
      events: mockLeafRegion.events,
    })
  })

  it('writes nothing, and says so, before the drawer has read the region', () => {
    // The overlay is a merge onto a shaped `Region` the widget fetched. With nothing cached
    // there is nothing to merge onto, and inventing a half-document would hand the drawer a
    // region with no bounds and no events.
    expect(writeRegionEdit(queryClient, LOCALE, mockLeafRegion.slug, node)).toBe(false)
    expect(
      queryClient.getQueryData(regionQuery(mockLeafRegion.slug, LOCALE).queryKey),
    ).toBeUndefined()
  })

  it('does not find a region cached under the bare key', () => {
    queryClient.setQueryData(['region', mockLeafRegion.slug], mockLeafRegion)

    expect(writeRegionEdit(queryClient, LOCALE, mockLeafRegion.slug, node)).toBe(false)
  })
})

/**
 * The document filter, as a pure predicate.
 *
 * ⚠ **Every `false` here is a populate that would otherwise fetch, and write, the wrong
 * document.** `useLivePreview` takes no collection, no id and no predicate: it merges any
 * message carrying a slug, and composes the endpoint from the panel's `collectionSlug` joined
 * to our own `initialData.id`. The collection half is therefore whatever the editor happens to
 * have open, and this is the only thing that reads it.
 *
 * The wiring — that each arm actually hands this predicate to the hook, at the right depth —
 * is covered in `LivePreviewController.transport.test.tsx`, which a pure spec cannot see.
 */
describe('namesPreviewedDoc', () => {
  it('accepts the endpoint composed for the document on screen', () => {
    expect(namesPreviewedDoc('events/507', 'events', 507)).toBe(true)
    expect(namesPreviewedDoc('regions/42', 'regions', 42)).toBe(true)
  })

  it('refuses another collection, including the two that are not documents here', () => {
    expect(namesPreviewedDoc('regions/507', 'events', 507)).toBe(false)
    expect(namesPreviewedDoc('events/42', 'regions', 42)).toBe(false)
    expect(namesPreviewedDoc('event-submissions/507', 'events', 507)).toBe(false)
    expect(namesPreviewedDoc('globals/sy-atlas-config', 'regions', 42)).toBe(false)
  })

  it('refuses a sibling document of the same collection', () => {
    // The library cannot compose this from our id — but a `globalSlug` message, or any future
    // change to how it builds the endpoint, can. The check is on the whole string for that
    // reason: what we authorized is one endpoint, not a prefix.
    expect(namesPreviewedDoc('events/508', 'events', 507)).toBe(false)
  })

  it('refuses everything while the id is still unknown', () => {
    // A region route carries a slug, so its id arrives with the drawer's own read. Until then
    // the composed endpoint is `regions/undefined`, and a request for it would 404 at best.
    expect(namesPreviewedDoc('regions/undefined', 'regions', undefined)).toBe(false)
    expect(namesPreviewedDoc('regions/42', 'regions', undefined)).toBe(false)
  })
})
