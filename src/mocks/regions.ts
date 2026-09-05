// Region / country / geojson fixtures for the view stories. Type-valid against the
// zod-inferred entity types — the view stories seed these straight into the React
// Query cache (bypassing the fetchers' zod parse), so TypeScript is the guard.
import type { EventSlim, Geojson, Region, RegionListItem, RegionNode, RegionRef } from '@/types'

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

/**
 * The wholesale region tree (`['regions']`) — the cache-once dict the region filter's
 * options, the region matcher, and the country-website check all read. Seeded for
 * every view story by the harness.
 *
 * Country slugs are the **lowercase ISO code** (`gb`, `in`), matching the live data
 * post-SahajCloud#556 rather than `mockCountries`' display slugs — the ISO-slug
 * invariant is exactly what `countryHasPrograms` looks a country up by. Ids match
 * `mockCountries`, and the two UK descendants match the feed's own region refs
 * (`mockEventSlim.region`, id 8001), so a feed feature really does resolve two levels
 * under `gb`. Iceland is deliberately absent: it is the program-less country the
 * country-website offer exists for.
 */
export const mockRegionNodes: RegionNode[] = [
  // Every `mockCountries` row carries a `countryCode`. A row without one would slug to
  // `''` and collide with the next, so it is dropped rather than silently folded in.
  ...mockCountries.flatMap<RegionNode>(({ id, name, countryCode }) => {
    if (!countryCode) return []
    const slug = countryCode.toLowerCase()

    return [{ id, slug, name, subtitle: null, level: 'country', parent: null, webPath: `/${slug}`, webUrl: null }] // prettier-ignore
  }),
  { id: 8000, slug: 'cambridgeshire', name: 'Cambridgeshire', subtitle: null, level: 'region', parent: 9001, webPath: '/gb/cambridgeshire', webUrl: null }, // prettier-ignore
  // The parent of `mockCityWithVenuesRegion`. Present for the same reason as
  // Cambridgeshire: the tree has to know the ancestors its own region fixtures sit under,
  // or the recovery ladder walks past them and every dead link previews the same rung.
  { id: 8010, slug: 'greater-london', name: 'Greater London', subtitle: null, level: 'region', parent: 9001, webPath: '/gb/greater-london', webUrl: null }, // prettier-ignore
  // The feed's own city ref, so the tree provably contains the region
  // `mockGeojson`'s located feature carries — renumber it there and this follows.
  { ...mockEventSlim.region, parent: 8000 },
]

/** A couple of child rows shown inside the mixed region, alongside its own events. */
const regionChildren: RegionListItem[] = [
  { id: 8101, slug: 'cambridge', level: 'city', name: 'Cambridge', eventCount: 12, path: '/united-kingdom/cambridgeshire/cambridge' }, // prettier-ignore
  { id: 8102, slug: 'ely', level: 'city', name: 'Ely', subtitle: 'Cambridgeshire', eventCount: 3, path: '/united-kingdom/cambridgeshire/ely' }, // prettier-ignore
]

/** Eight child rows for the full (country) parent — a mix of rows that carry a
 *  disambiguating subtitle and rows that do not. */
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

/** Two venues inside a city — the child rows a "city with venues" region shows.
 *  Level `venue` is the leaf. It routes to a venue page. */
const cityVenues: RegionListItem[] = [
  { id: 8201, slug: '44-chelsham-road', level: 'venue', name: '44 Chelsham Rd', eventCount: 6, path: '/united-kingdom/greater-london/london/44-chelsham-road' }, // prettier-ignore
  { id: 8202, slug: 'flood-street', level: 'venue', name: 'Flood Street', eventCount: 4, path: '/united-kingdom/greater-london/london/flood-street' }, // prettier-ignore
]

/**
 * A mixed region: child-region cards AND its own free-floating located events in one
 * list, led by an "Online Classes" roll-up card. A region can hold both venues/child
 * areas and events pinned to the region itself (not to a child), and they render
 * together — the mixed shape RegionView supports.
 */
export const mockParentRegion: Region = {
  id: 8001,
  slug: 'cambridgeshire',
  name: 'Cambridgeshire',
  level: 'region',
  subtitle: null,
  // Only country-level regions carry a countryCode (RegionView shows the country
  // name for those). A sub-country region leaves it null, so its own name shows.
  countryCode: null,
  eventCount: 18,
  bounds: [-0.5, 52.0, 0.5, 52.6],
  center: [0.0, 52.3],
  path: '/united-kingdom/cambridgeshire',
  parentPath: '/united-kingdom',
  webUrl: 'https://atlas.example/united-kingdom/cambridgeshire',
  subregions: regionChildren,
  events: mockEventVariants.filter((event) => event.eventType === 'offline').slice(0, 4),
  onlineEvents: [mockEventSlimOnline],
}

/**
 * A full parent (a country): eight child-region cards led by an "Online Classes"
 * roll-up, with a mix of rows that carry a subtitle and rows that do not. The header
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

// A busy leaf city's roster: the located variants repeated a few times with unique
// ids/titles, so the City example shows a long, scrollable gallery rather than the
// handful the raw variant list holds.
const offlineVariants = mockEventVariants.filter((event) => event.eventType === 'offline')
const cityEvents: EventSlim[] = [0, 1, 2].flatMap((pass) =>
  offlineVariants.map((event, i) => {
    const id = 8300 + pass * offlineVariants.length + i

    return {
      ...event,
      id,
      title: pass === 0 ? event.title : `${event.title} ${pass + 1}`,
      path: `/united-kingdom/cambridgeshire/cambridge/${id}`,
    }
  }),
)

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
  eventCount: cityEvents.length,
  path: '/united-kingdom/cambridgeshire/cambridge',
  parentPath: '/united-kingdom/cambridgeshire',
  subregions: [],
  events: cityEvents,
  onlineEvents: mockEventVariants.filter((event) => event.eventType === 'online'),
}

/**
 * A mixed city: venues as its children AND its own free-floating located events,
 * led by an "Online Classes" roll-up — London with two venues ("44 Chelsham Rd",
 * "Flood Street") plus a few classes pinned to the city itself.
 */
export const mockCityWithVenuesRegion: Region = {
  ...mockParentRegion,
  id: 8200,
  slug: 'london',
  name: 'London',
  level: 'city',
  subtitle: 'Greater London',
  eventCount: 24,
  path: '/united-kingdom/greater-london/london',
  parentPath: '/united-kingdom/greater-london',
  subregions: cityVenues,
  events: offlineVariants.slice(0, 5),
}

// No `mockMinimalRegion` any more: the empty region was a fixture of its own until
// `Empty` moved onto the view stories' Fallback axis, which derives it from whichever
// region is selected — so every example can be seen barren, rather than one fixed city
// standing in for all of them.

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
