import { describe, it, expect } from 'vitest'

import { RegionListItemSchema, RegionNodeSchema, RegionSchema } from './region'

import { mockEventSlim, mockEventSlimList, mockEventSlimOnline } from '@/mocks/events'

const regionNode = {
  id: 473,
  slug: 'antwerpen',
  level: 'city',
  name: 'Antwerpen',
  parent: 28,
  webPath: '/belgium/antwerpen',
  webUrl: 'https://atlas.example/belgium/antwerpen',
}

const listItem = {
  id: 9,
  slug: 'antwerpen',
  level: 'city',
  name: 'Antwerpen',
  subtitle: null,
  eventCount: 2,
  path: '/belgium/flanders/antwerpen',
}

// A country: `subregions` populated, `events` empty.
const country = {
  id: 28,
  slug: 'belgium',
  name: 'Belgium',
  level: 'country',
  countryCode: 'BE',
  eventCount: 5,
  bounds: [3, 50, 5, 52],
  center: [4, 51],
  path: '/belgium',
  parentPath: undefined,
  webUrl: 'https://atlas.example/belgium',
  subregions: [listItem],
  events: [],
  onlineEvents: [],
}

// A center (venue): `events` populated, derived center point.
const venue = {
  id: 13,
  slug: 'town-hall',
  name: 'Town Hall',
  level: 'center',
  eventCount: mockEventSlimList.length,
  bounds: [4.35, 50.85, 4.35, 50.85],
  center: [4.35, 50.85],
  path: '/belgium/flanders/antwerpen/town-hall',
  parentPath: '/belgium/flanders/antwerpen',
  subregions: [],
  events: mockEventSlimList,
  onlineEvents: [],
}

describe('RegionNodeSchema', () => {
  it('parses a wholesale region node with its parent link + webPath', () => {
    const parsed = RegionNodeSchema.parse(regionNode)

    expect(parsed.level).toBe('city')
    expect(parsed.parent).toBe(28)
    expect(parsed.webPath).toBe('/belgium/antwerpen')
  })

  it('accepts a country root with a null parent', () => {
    const parsed = RegionNodeSchema.parse({ ...regionNode, parent: null, level: 'country' })

    expect(parsed.parent).toBeNull()
  })

  it('rejects an unknown level', () => {
    expect(() => RegionNodeSchema.parse({ ...regionNode, level: 'planet' })).toThrow()
  })
})

describe('RegionListItemSchema', () => {
  it('parses a child list item with its nested path', () => {
    expect(RegionListItemSchema.parse(listItem).path).toBe('/belgium/flanders/antwerpen')
  })

  it('carries a countryCode for the home country list', () => {
    const parsed = RegionListItemSchema.parse({ ...listItem, level: 'country', countryCode: 'GB' })

    expect(parsed.countryCode).toBe('GB')
  })

  it('rejects a non-numeric eventCount', () => {
    expect(() => RegionListItemSchema.parse({ ...listItem, eventCount: 'many' })).toThrow()
  })
})

describe('RegionSchema', () => {
  it('parses a country: subregions populated, events empty', () => {
    const parsed = RegionSchema.parse(country)

    expect(parsed.level).toBe('country')
    expect(parsed.subregions).toHaveLength(1)
    expect(parsed.events).toHaveLength(0)
    expect(parsed.countryCode).toBe('BE')
    expect(parsed.webUrl).toBe('https://atlas.example/belgium')
  })

  it('parses a center (venue) with a derived center point and events', () => {
    const parsed = RegionSchema.parse(venue)

    expect(parsed.center).toEqual([4.35, 50.85])
    expect(parsed.events).toHaveLength(mockEventSlimList.length)
  })

  it('rolls up online events disjoint from located events', () => {
    const parsed = RegionSchema.parse({
      ...venue,
      events: [mockEventSlim],
      onlineEvents: [mockEventSlimOnline],
    })

    expect(parsed.events.map((event) => event.eventType)).toEqual(['offline'])
    expect(parsed.onlineEvents).toHaveLength(1)
    expect(parsed.onlineEvents[0].eventType).toBe('online')
  })

  it('allows null bounds and null center', () => {
    const parsed = RegionSchema.parse({ ...country, bounds: null, center: null })

    expect(parsed.bounds).toBeNull()
    expect(parsed.center).toBeNull()
  })

  it('rejects a bounds tuple of the wrong length', () => {
    expect(() => RegionSchema.parse({ ...country, bounds: [0, 0, 0] })).toThrow()
  })
})
