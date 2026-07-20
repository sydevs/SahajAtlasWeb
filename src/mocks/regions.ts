// Region / country / geojson fixtures for the view stories. Type-valid against the
// zod-inferred entity types — the view stories seed these straight into the React
// Query cache (bypassing the fetchers' zod parse), so TypeScript is the guard.
import type { Geojson, Region, RegionListItem, RegionRef } from '@/types'

import { mockEventSlim, mockEventSlimList, mockEventSlimOnline } from './events'

const ukRef: RegionRef = {
  id: 9001,
  slug: 'united-kingdom',
  level: 'country',
  name: 'United Kingdom',
  subtitle: null,
  webPath: '/united-kingdom',
  webUrl: 'https://atlas.example/united-kingdom',
}

/** The country list (CountriesView). */
export const mockCountries: RegionListItem[] = [
  {
    id: 9001,
    slug: 'united-kingdom',
    level: 'country',
    name: 'United Kingdom',
    countryCode: 'GB',
    eventCount: 128,
    path: '/united-kingdom',
  },
  {
    id: 9002,
    slug: 'india',
    level: 'country',
    name: 'India',
    countryCode: 'IN',
    eventCount: 342,
    path: '/india',
  },
  {
    id: 9003,
    slug: 'italy',
    level: 'country',
    name: 'Italy',
    countryCode: 'IT',
    eventCount: 64,
    path: '/italy',
  },
]

/** The child-region rows shown inside a parent region. */
const childRegions: RegionListItem[] = [
  { id: 8101, slug: 'cambridge', level: 'city', name: 'Cambridge', eventCount: 12, path: '/united-kingdom/cambridgeshire/cambridge' }, // prettier-ignore
  { id: 8102, slug: 'ely', level: 'city', name: 'Ely', subtitle: 'Cambridgeshire', eventCount: 3, path: '/united-kingdom/cambridgeshire/ely' }, // prettier-ignore
]

/** A parent region: child-region cards + located events + an online roll-up. */
export const mockParentRegion: Region = {
  id: 8001,
  slug: 'cambridgeshire',
  name: 'Cambridgeshire',
  level: 'region',
  subtitle: null,
  // Only country-level regions carry a countryCode (RegionView shows the country
  // name for those); a sub-country region leaves it null so its own name shows.
  countryCode: null,
  eventCount: 18,
  bounds: [-0.5, 52.0, 0.5, 52.6],
  center: [0.0, 52.3],
  path: '/united-kingdom/cambridgeshire',
  parentPath: '/united-kingdom',
  webUrl: 'https://atlas.example/united-kingdom/cambridgeshire',
  subregions: childRegions,
  events: mockEventSlimList,
  onlineEvents: [mockEventSlimOnline],
}

/** A leaf region (a city): its own located events, no child regions. */
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
  events: [mockEventSlim],
  onlineEvents: [mockEventSlimOnline],
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
