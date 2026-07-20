// Region / country / geojson fixtures for the view stories. Type-valid against the
// zod-inferred entity types — the view stories seed these straight into the React
// Query cache (bypassing the fetchers' zod parse), so TypeScript is the guard.
import type { Geojson, Region, RegionListItem, RegionRef } from '@/types'

import { mockEventSlim, mockEventSlimOnline, mockEventVariants } from './events'

const ukRef: RegionRef = {
  id: 9001,
  slug: 'united-kingdom',
  level: 'country',
  name: 'United Kingdom',
  subtitle: null,
  webPath: '/united-kingdom',
  webUrl: 'https://atlas.example/united-kingdom',
}

// The country list (CountriesView). Deliberately NOT pre-sorted — CountriesView
// orders by event count itself, so this unsorted spread proves that ordering holds.
export const mockCountries: RegionListItem[] = [
  { id: 9001, slug: 'united-kingdom', level: 'country', name: 'United Kingdom', countryCode: 'GB', eventCount: 128, path: '/united-kingdom' }, // prettier-ignore
  { id: 9002, slug: 'india', level: 'country', name: 'India', countryCode: 'IN', eventCount: 342, path: '/india' }, // prettier-ignore
  { id: 9003, slug: 'italy', level: 'country', name: 'Italy', countryCode: 'IT', eventCount: 64, path: '/italy' }, // prettier-ignore
  { id: 9004, slug: 'australia', level: 'country', name: 'Australia', countryCode: 'AU', eventCount: 47, path: '/australia' }, // prettier-ignore
  { id: 9005, slug: 'canada', level: 'country', name: 'Canada', countryCode: 'CA', eventCount: 89, path: '/canada' }, // prettier-ignore
  { id: 9006, slug: 'france', level: 'country', name: 'France', countryCode: 'FR', eventCount: 156, path: '/france' }, // prettier-ignore
  { id: 9007, slug: 'germany', level: 'country', name: 'Germany', countryCode: 'DE', eventCount: 73, path: '/germany' }, // prettier-ignore
  { id: 9008, slug: 'united-states', level: 'country', name: 'United States', countryCode: 'US', eventCount: 211, path: '/united-states' }, // prettier-ignore
  { id: 9009, slug: 'brazil', level: 'country', name: 'Brazil', countryCode: 'BR', eventCount: 118, path: '/brazil' }, // prettier-ignore
  { id: 9010, slug: 'spain', level: 'country', name: 'Spain', countryCode: 'ES', eventCount: 52, path: '/spain' }, // prettier-ignore
  { id: 9011, slug: 'netherlands', level: 'country', name: 'Netherlands', countryCode: 'NL', eventCount: 38, path: '/netherlands' }, // prettier-ignore
  { id: 9012, slug: 'romania', level: 'country', name: 'Romania', countryCode: 'RO', eventCount: 61, path: '/romania' }, // prettier-ignore
]

/** The single child row shown inside the minimal parent region. */
const parentChild: RegionListItem[] = [
  { id: 8101, slug: 'cambridge', level: 'city', name: 'Cambridge', eventCount: 12, path: '/united-kingdom/cambridgeshire/cambridge' }, // prettier-ignore
]

/** Eight child rows for the full (country) parent — a mix of rows that carry a
 *  disambiguating subtitle and rows that don't. */
const countrySubregions: RegionListItem[] = [
  { id: 9101, slug: 'greater-london', level: 'region', name: 'Greater London', eventCount: 210, path: '/united-kingdom/greater-london' }, // prettier-ignore
  { id: 9102, slug: 'greater-manchester', level: 'region', name: 'Greater Manchester', eventCount: 96, path: '/united-kingdom/greater-manchester' }, // prettier-ignore
  { id: 9103, slug: 'cambridge', level: 'city', name: 'Cambridge', subtitle: 'Cambridgeshire', eventCount: 48, path: '/united-kingdom/cambridgeshire/cambridge' }, // prettier-ignore
  { id: 9104, slug: 'birmingham', level: 'city', name: 'Birmingham', subtitle: 'West Midlands', eventCount: 42, path: '/united-kingdom/west-midlands/birmingham' }, // prettier-ignore
  { id: 9105, slug: 'bristol', level: 'city', name: 'Bristol', eventCount: 37, path: '/united-kingdom/bristol' }, // prettier-ignore
  { id: 9106, slug: 'brighton', level: 'city', name: 'Brighton', subtitle: 'East Sussex', eventCount: 29, path: '/united-kingdom/east-sussex/brighton' }, // prettier-ignore
  { id: 9107, slug: 'leeds', level: 'city', name: 'Leeds', eventCount: 24, path: '/united-kingdom/leeds' }, // prettier-ignore
  { id: 9108, slug: 'oxford', level: 'city', name: 'Oxford', subtitle: 'Oxfordshire', eventCount: 15, path: '/united-kingdom/oxfordshire/oxford' }, // prettier-ignore
]

/**
 * A minimal parent region: a single child-region card and no online roll-up — the
 * sparsest parent. A region is EITHER a parent (child regions) OR a leaf (events) —
 * the mixed "sub-regions and events together" shape has been retired, so `events`
 * stays empty here.
 */
export const mockParentRegion: Region = {
  id: 8001,
  slug: 'cambridgeshire',
  name: 'Cambridgeshire',
  level: 'region',
  subtitle: null,
  // Only country-level regions carry a countryCode (RegionView shows the country
  // name for those); a sub-country region leaves it null so its own name shows.
  countryCode: null,
  eventCount: 12,
  bounds: [-0.5, 52.0, 0.5, 52.6],
  center: [0.0, 52.3],
  path: '/united-kingdom/cambridgeshire',
  parentPath: '/united-kingdom',
  webUrl: 'https://atlas.example/united-kingdom/cambridgeshire',
  subregions: parentChild,
  events: [],
  onlineEvents: [],
}

/**
 * A full parent (a country): eight child-region cards led by an "Online Classes"
 * roll-up, with a mix of rows that carry a subtitle and rows that don't. The header
 * shows the localized country name (via `countryCode`).
 */
export const mockCountryRegion: Region = {
  id: 9001,
  slug: 'united-kingdom',
  name: 'United Kingdom',
  level: 'country',
  subtitle: null,
  countryCode: 'GB',
  eventCount: 501,
  bounds: [-8.6, 49.9, 1.8, 58.7],
  center: [-2.5, 54.2],
  path: '/united-kingdom',
  parentPath: '/',
  webUrl: 'https://atlas.example/united-kingdom',
  subregions: countrySubregions,
  events: [],
  onlineEvents: [
    mockEventSlimOnline,
    { ...mockEventSlimOnline, id: 202, title: 'Morning Online Class' },
    { ...mockEventSlimOnline, id: 203, title: 'Weekend Online Session' },
  ],
}

/** A leaf region (a city): its own located events (the full card gallery), no child
 *  regions, with its online classes listed inline after them. Located vs online are
 *  disjoint (a real feed splits them the same way), so the shared variant list is
 *  partitioned by type rather than duplicating an event across both slots. */
export const mockLeafRegion: Region = {
  ...mockParentRegion,
  id: 8101,
  slug: 'cambridge',
  name: 'Cambridge',
  level: 'city',
  subtitle: 'Cambridgeshire',
  eventCount: 12,
  path: '/united-kingdom/cambridgeshire/cambridge',
  parentPath: '/united-kingdom/cambridgeshire',
  subregions: [],
  events: mockEventVariants.filter((event) => event.eventType === 'offline'),
  onlineEvents: mockEventVariants.filter((event) => event.eventType === 'online'),
}

/** Minimal region: no children, no events (the sparsest valid state). */
export const mockMinimalRegion: Region = {
  ...mockLeafRegion,
  id: 8199,
  slug: 'ely',
  name: 'Ely',
  eventCount: 0,
  bounds: null,
  center: null,
  subregions: [],
  events: [],
  onlineEvents: [],
}

/** The map feed — a handful of features, some online, for the country/filter views. */
export const mockGeojson: Geojson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 101,
      geometry: { type: 'Point', coordinates: [0.1218, 52.2053] },
      properties: {
        id: 101,
        eventType: 'offline',
        languages: ['en'],
        address: mockEventSlim.address,
        schedule: mockEventSlim.schedule,
        region: mockEventSlim.region,
        webPath: '/united-kingdom/cambridge/101',
      },
    },
    {
      type: 'Feature',
      id: 102,
      geometry: null,
      properties: {
        id: 102,
        eventType: 'online',
        languages: ['fr', 'en'],
        region: ukRef,
        webPath: '/united-kingdom/102',
      },
    },
    {
      type: 'Feature',
      id: 103,
      geometry: null,
      properties: {
        id: 103,
        eventType: 'online',
        languages: ['de'],
        region: ukRef,
        webPath: '/united-kingdom/103',
      },
    },
  ],
}
