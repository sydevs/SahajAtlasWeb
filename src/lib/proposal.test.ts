import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { Event } from '@/types'

import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'

import {
  type ListingDraft,
  buildProposal,
  diffPatch,
  draftPreviewSchedule,
  draftLocation,
  emptyDraft,
  eventToDraft,
  featureToPlace,
  firstInvalidStep,
  nearestTimeZone,
  newListingPatch,
  openListing,
  previewEvent,
  previewSessions,
  searchProximity,
  stepErrors,
} from './proposal'

import { PROPOSABLE_EVENT_FIELDS } from '@/config/api/proposal'

// The two shapes Mapbox Geocoding v6 retrieves: an address, whose city, state and country sit
// in `context`, and a city, which is its own `place` layer. Only the fields the flow reads.
const addressFeature = {
  type: 'Feature',
  id: 'address.1',
  geometry: { type: 'Point', coordinates: [-0.1276, 51.5034] },
  properties: {
    mapbox_id: 'dXJuOm1ieGFkcjoxMjM0',
    feature_type: 'address',
    name: '10 Downing Street',
    full_address: '10 Downing Street, London SW1A 2AA, United Kingdom',
    coordinates: { longitude: -0.1276, latitude: 51.5034 },
    context: {
      address: { mapbox_id: 'dXJuOm1ieGFkcjoxMjM0', name: '10 Downing Street' },
      postcode: { mapbox_id: 'cG9zdGNvZGU', name: 'SW1A 2AA' },
      place: { mapbox_id: 'dXJuOm1ieHBsYzpBUVRC', name: 'London' },
      region: { mapbox_id: 'dXJuOm1ieHBsYzpBVFk=', name: 'England', region_code_full: 'GB-ENG' },
      country: { mapbox_id: 'dXJuOm1ieHBsYzpJdTA', name: 'United Kingdom', country_code: 'gb' },
    },
  },
} as unknown as GeocodingFeature

const cityFeature = {
  type: 'Feature',
  id: 'place.1',
  geometry: { type: 'Point', coordinates: [4.3517, 50.8503] },
  properties: {
    mapbox_id: 'dXJuOm1ieHBsYzpCcnU',
    feature_type: 'place',
    name: 'Brussels',
    full_address: 'Brussels, Belgium',
    coordinates: { longitude: 4.3517, latitude: 50.8503 },
    context: {
      region: { mapbox_id: 'dXJuOm1ieHBsYzpCQ1I', name: 'Brussels-Capital' },
      country: { mapbox_id: 'dXJuOm1ieHBsYzpCRQ', name: 'Belgium', country_code: 'be' },
    },
  },
} as unknown as GeocodingFeature

const inPerson = (overrides: Partial<ListingDraft> = {}): ListingDraft => ({
  ...emptyDraft('Europe/London', ['en']),
  address: featureToPlace(addressFeature),
  firstDate: '2026-11-03',
  startTime: '19:00',
  endTime: '20:30',
  repeats: 'weekly',
  ...overrides,
})

const online = (overrides: Partial<ListingDraft> = {}): ListingDraft => ({
  ...inPerson(),
  eventType: 'online',
  address: null,
  onlineUrl: 'https://meet.example/abc',
  city: featureToPlace(cityFeature),
  timeZone: 'Europe/Brussels',
  ...overrides,
})

describe('featureToPlace', () => {
  it('keeps an address its own id, and takes its city, state and country from context', () => {
    const place = featureToPlace(addressFeature)

    expect(place.mapboxId).toBe('dXJuOm1ieGFkcjoxMjM0')
    expect(place.location).toEqual({
      placeId: 'dXJuOm1ieHBsYzpBUVRC',
      regionId: 'dXJuOm1ieHBsYzpBVFk=',
      countryId: 'dXJuOm1ieHBsYzpJdTA',
    })
    expect(place).toMatchObject({
      street: '10 Downing Street',
      postCode: 'SW1A 2AA',
      city: 'London',
      region: 'GB-ENG',
      country: 'GB',
      latitude: 51.5034,
      longitude: -0.1276,
    })
  })

  it('makes a picked city its own place layer', () => {
    // A city names itself by its own id, not by a `context.place` it does not have.
    expect(featureToPlace(cityFeature).location).toEqual({
      placeId: 'dXJuOm1ieHBsYzpCcnU',
      regionId: 'dXJuOm1ieHBsYzpCQ1I',
      countryId: 'dXJuOm1ieHBsYzpCRQ',
    })
  })
})

describe('stepErrors', () => {
  it('refuses to leave Where in person without an address', () => {
    expect(stepErrors('where', inPerson({ address: null }))).toEqual({ address: true })
    expect(stepErrors('where', inPerson())).toEqual({})
  })

  it('refuses an online class without a city, or without a web join link', () => {
    expect(stepErrors('where', online({ city: null }))).toEqual({ city: true })
    expect(stepErrors('where', online({ onlineUrl: 'meet.example' }))).toEqual({ onlineUrl: true })
    expect(stepErrors('where', online())).toEqual({})
  })

  it('keeps the stored join link when correcting a class that is already online', () => {
    const base = online({ onlineUrl: '' })

    // The widget never reads a join link, so a blank one on an online correction keeps it.
    expect(stepErrors('where', base, base)).toEqual({})
    expect(firstInvalidStep(base, base)).toBeNull()
    // A typed link is still checked, and a class becoming online must supply one.
    expect(stepErrors('where', online({ onlineUrl: 'nope' }), base)).toEqual({ onlineUrl: true })
    expect(stepErrors('where', online({ onlineUrl: '' }), inPerson())).toEqual({
      onlineUrl: true,
    })
  })

  it('needs a first date and a start time, and nothing else on When', () => {
    expect(stepErrors('when', inPerson({ firstDate: '', startTime: '7pm' }))).toEqual({
      firstDate: true,
      startTime: true,
    })
    expect(stepErrors('when', inPerson({ endTime: '' }))).toEqual({})
  })

  it('refuses a last date before the first, and only for a repeating class', () => {
    const backwards = { firstDate: '2026-11-03', endDate: '2026-10-01' }

    expect(stepErrors('when', inPerson({ ...backwards, repeats: 'weekly' }))).toEqual({
      firstDate: true,
    })
    expect(stepErrors('when', inPerson({ ...backwards, repeats: 'once' }))).toEqual({})
    expect(
      stepErrors('when', inPerson({ firstDate: '2026-11-03', endDate: '2026-11-03' })),
    ).toEqual({})
  })

  it('lets Contact be skipped, but not filled with a broken address', () => {
    expect(stepErrors('contact', inPerson())).toEqual({})
    expect(stepErrors('contact', inPerson({ contactEmail: 'nope' }))).toEqual({
      contactEmail: true,
    })
  })

  it('refuses a website that is not an absolute web address, rather than dropping it', () => {
    expect(stepErrors('more', inPerson({ website: 'oxford.example' }))).toEqual({ website: true })
    expect(stepErrors('more', inPerson({ website: 'https://oxford.example' }))).toEqual({})
    expect(stepErrors('more', inPerson({ website: '' }))).toEqual({})
    expect(firstInvalidStep(inPerson({ website: 'oxford.example' }))).toBe('more')
  })

  it('names the first step a submit would be refused at', () => {
    expect(firstInvalidStep(online({ city: null }))).toBe('where')
    expect(firstInvalidStep(inPerson({ startTime: '' }))).toBe('when')
    expect(firstInvalidStep(inPerson())).toBeNull()
  })
})

describe('a new listing', () => {
  it('sends the address id in the address group, and the layers above it as location', () => {
    const { proposed, location, event } = buildProposal(inPerson())

    expect(proposed.address?.mapboxId).toBe('dXJuOm1ieGFkcjoxMjM0')
    expect(location).toEqual({
      placeId: 'dXJuOm1ieHBsYzpBUVRC',
      regionId: 'dXJuOm1ieHBsYzpBVFk=',
      countryId: 'dXJuOm1ieHBsYzpJdTA',
    })
    expect(event).toBeUndefined()
  })

  it('sends an online class its city as location.placeId, and no address', () => {
    const { proposed, location } = buildProposal(online())

    expect(location.placeId).toBe('dXJuOm1ieHBsYzpCcnU')
    expect(proposed).not.toHaveProperty('address')
    expect(proposed.onlineUrl).toBe('https://meet.example/abc')
  })

  it('carries only proposable Events fields, and never region or regionHint', () => {
    const { proposed } = buildProposal(
      inPerson({ title: 'Evening meditation', contactPhone: '123', website: 'https://a.example' }),
    )

    for (const key of Object.keys(proposed)) {
      expect(PROPOSABLE_EVENT_FIELDS as readonly string[]).toContain(key)
    }
    expect(proposed).not.toHaveProperty('region')
    expect(proposed).not.toHaveProperty('regionHint')
  })

  it('leaves out every field the visitor left blank', () => {
    const proposed = newListingPatch(inPerson())

    expect(proposed).not.toHaveProperty('contactPhone')
    expect(proposed).not.toHaveProperty('title')
    expect(proposed.address).not.toHaveProperty('room')
    expect(proposed.schedule).not.toHaveProperty('untilDate')
  })

  it('stores the first session as the instant it is in the class zone', () => {
    const schedule = newListingPatch(inPerson({ timeZone: 'America/New_York' })).schedule

    // 19:00 in New York on 3 Nov 2026 (EST, UTC-5).
    expect(schedule?.firstDate).toBe('2026-11-04T00:00:00.000Z')
    expect(schedule?.firstDate_tz).toBe('America/New_York')
  })

  it('repeats weekly on the first session weekday, monthly on its date, or not at all', () => {
    // 3 Nov 2026 is a Tuesday.
    expect(newListingPatch(inPerson()).schedule).toMatchObject({
      recurrenceType: 'WEEKLY',
      interval: 1,
      weekdays: ['TU'],
    })
    expect(newListingPatch(inPerson({ repeats: 'monthly' })).schedule).toMatchObject({
      recurrenceType: 'MONTHLY',
      monthlyMode: 'date',
      monthDay: 3,
    })
    expect(newListingPatch(inPerson({ repeats: 'once' })).schedule).not.toHaveProperty(
      'recurrenceType',
    )
  })

  it('ends a repeating class on its end date, and ignores one for a one-off', () => {
    expect(newListingPatch(inPerson({ endDate: '2027-06-30' })).schedule).toMatchObject({
      endingType: 'until',
    })
    expect(
      newListingPatch(inPerson({ repeats: 'once', endDate: '2027-06-30' })).schedule,
    ).not.toHaveProperty('endingType')
  })

  it('writes the description as paragraphs of rich text', () => {
    const { description } = newListingPatch(inPerson({ description: 'First.\n\nSecond.' }))

    expect(description?.root.children).toHaveLength(2)
  })
})

const publishedEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 507,
  title: 'Monday evening meditation',
  eventType: 'offline',
  languages: ['en'],
  inactive: false,
  address: {
    mapboxId: 'dXJuOm1ieGFkcjo5OTk',
    street: '1 High Street',
    room: 'Hall A',
    postCode: 'AB1 2CD',
    city: 'Oxford',
    country: 'GB',
    region: 'GB-ENG',
    latitude: 51.75,
    longitude: -1.25,
  },
  schedule: {
    firstDate: new Date('2024-01-08T19:00:00Z'),
    firstDate_tz: 'Europe/London',
    endTime: '20:00',
    recurrenceType: 'WEEKLY',
    interval: 2,
    weekdays: ['MO', 'WE'],
    upcomingDates: [new Date('2026-11-02T19:00:00Z')],
  },
  description: {
    root: {
      children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Bring a shawl.' }] }],
    },
  },
  images: [],
  contactPhone: '01865 000000',
  contactName: 'Sam',
  website: 'https://oxford.example',
  registrationMode: 'sahaj-atlas',
  region: { id: 9, slug: 'oxford', name: 'Oxford', level: 'city' },
  path: '/gb/oxford/507',
  ...overrides,
})

describe('a correction', () => {
  const event = publishedEvent()
  const baseDraft = eventToDraft(event)
  const correction = { eventId: event.id, baseDraft }

  it('sends nothing when nothing changed, however lossy the round trip', () => {
    // A two-weekly, two-day class does not fit the flow's choices. Untouched, it must not be
    // flattened into a weekly one-day class by the act of opening it.
    expect(buildProposal(baseDraft, correction)).toEqual({ event: 507, proposed: {}, location: {} })
  })

  it('names the event and sends only the changed leaves', () => {
    const { event: target, proposed } = buildProposal(
      { ...baseDraft, room: 'Hall B', contactName: 'Alex' },
      correction,
    )

    expect(target).toBe(507)
    expect(proposed).toEqual({ address: { room: 'Hall B' }, contactName: 'Alex' })
  })

  it('sends a cleared field as null, which is how a patch clears a value', () => {
    expect(buildProposal({ ...baseDraft, contactPhone: '' }, correction).proposed).toEqual({
      contactPhone: null,
    })
  })

  it('moves only the start time, leaving the stored zone and repeat alone', () => {
    const { proposed } = buildProposal({ ...baseDraft, startTime: '18:30' }, correction)

    expect(proposed).toEqual({ schedule: { firstDate: '2024-01-08T18:30:00.000Z' } })
  })

  it('clears the address leaves a newly picked place does not carry', () => {
    const picked = { ...featureToPlace(addressFeature), postCode: undefined, region: undefined }
    const { proposed } = buildProposal({ ...baseDraft, address: picked }, correction)

    // SahajCloud merges the address group leaf by leaf, so an absent leaf would keep the old
    // venue's postcode and subdivision on the new one.
    expect(proposed.address).toMatchObject({ postCode: null, region: null })
  })

  it('re-places the class only when a new place is picked', () => {
    expect(buildProposal({ ...baseDraft, room: 'x' }, correction).location).toEqual({})

    const moved = buildProposal(
      { ...baseDraft, address: featureToPlace(addressFeature) },
      correction,
    )

    expect(moved.location.placeId).toBe('dXJuOm1ieHBsYzpBUVRC')
    expect(moved.proposed.address?.mapboxId).toBe('dXJuOm1ieGFkcjoxMjM0')
  })

  it('opens the published class as its draft', () => {
    expect(baseDraft).toMatchObject({
      eventType: 'offline',
      room: 'Hall A',
      firstDate: '2024-01-08',
      startTime: '19:00',
      repeats: 'weekly',
      timeZone: 'Europe/London',
      description: 'Bring a shawl.',
      contactPhone: '01865 000000',
      title: 'Monday evening meditation',
    })
  })

  it('reads a malformed stored zone as UTC, the way every other surface does', () => {
    const malformed = publishedEvent({
      schedule: { ...publishedEvent().schedule!, firstDate_tz: 'Not/AZone' as never },
    })

    expect(eventToDraft(malformed)).toMatchObject({
      timeZone: 'UTC',
      firstDate: '2024-01-08',
      startTime: '19:00',
    })
  })
})

describe('diffPatch', () => {
  it('compares groups leaf by leaf, and arrays whole', () => {
    expect(
      diffPatch(
        { languages: ['en'], address: { city: 'A', room: 'x' } },
        { languages: ['en', 'fr'], address: { city: 'A', room: 'x' } },
      ),
    ).toEqual({ languages: ['en', 'fr'] })
  })
})

describe('draftLocation', () => {
  it('reads the address in person and the city online', () => {
    expect(draftLocation(inPerson()).placeId).toBe('dXJuOm1ieHBsYzpBUVRC')
    expect(draftLocation(online()).placeId).toBe('dXJuOm1ieHBsYzpCcnU')
    expect(draftLocation(online({ city: null }))).toEqual({})
  })
})

describe('the live listing', () => {
  it('fills in from the draft, and names an untitled class after its street', () => {
    const preview = previewEvent(inPerson({ room: 'Hall 2', contactName: 'Ada' }), {
      path: '/add',
    })

    expect(preview.title).toBe('10 Downing Street')
    expect(preview.address?.room).toBe('Hall 2')
    expect(preview.contactName).toBe('Ada')
    expect(preview.schedule?.recurrenceType).toBe('WEEKLY')
    expect(preview.path).toBe('/add')
  })

  it('has no schedule until a date and time are entered', () => {
    expect(previewEvent(inPerson({ startTime: '' }), { path: '/add' }).schedule).toBeNull()
  })

  it('keeps the published description and sessions where the visitor changed neither', () => {
    const event = publishedEvent()
    const base = { event, draft: eventToDraft(event) }
    const preview = previewEvent({ ...base.draft, contactName: 'Alex' }, { path: '/x', base })

    expect(preview.description).toBe(event.description)
    expect(preview.schedule).toBe(event.schedule)
    expect(preview.contactName).toBe('Alex')
  })

  it('takes a memoized schedule as given, and builds the same one itself otherwise', () => {
    const draft = inPerson()
    const schedule = draftPreviewSchedule(draft)

    expect(previewEvent(draft, { path: '/add', schedule }).schedule).toBe(schedule)
    expect(previewEvent(draft, { path: '/add' }).schedule).toEqual(schedule)
  })

  it('projects the sessions a weekly class would have, from today on', () => {
    const now = DateTime.fromISO('2026-11-20T12:00:00Z')
    const sessions = previewSessions(inPerson(), now)

    expect(sessions[0].toISOString()).toBe('2026-11-24T19:00:00.000Z')
    expect(sessions).toHaveLength(8)
  })

  it('stops projecting at the end date', () => {
    const now = DateTime.fromISO('2026-11-01T12:00:00Z')

    expect(previewSessions(inPerson({ endDate: '2026-11-17' }), now)).toHaveLength(3)
  })
})

describe('nearestTimeZone', () => {
  const points = [
    { position: [-0.1, 51.5], timeZone: 'Europe/London' },
    { position: [4.35, 50.85], timeZone: 'Europe/Brussels' },
  ]

  it('lends the picked place the zone of the nearest listed class', () => {
    expect(nearestTimeZone({ latitude: 50.9, longitude: 4.4 }, points)).toBe('Europe/Brussels')
  })

  it('lends nothing where no class is near', () => {
    expect(nearestTimeZone({ latitude: 40.7, longitude: -74 }, points)).toBeUndefined()
    expect(nearestTimeZone(null, points)).toBeUndefined()
  })
})

describe('searchProximity', () => {
  it('starts the search at the centre of the region the flow opened over', () => {
    expect(searchProximity([-0.12, 51.5])).toEqual({ lng: -0.12, lat: 51.5 })
  })

  it('leaves the search unbiased with no region', () => {
    expect(searchProximity(null)).toBeUndefined()
    expect(searchProximity(undefined)).toBeUndefined()
  })
})

describe('openListing', () => {
  it('opens a correction on review, prefilled, with the published class as its base', () => {
    const event = publishedEvent()
    const opened = openListing({ event })

    expect(opened.step).toBe('review')
    expect(opened.draft).toEqual(eventToDraft(event))
    expect(opened.base).toBe(opened.draft)
  })

  it('opens a new listing blank, on Where, in the visitor zone', () => {
    const opened = openListing({ timeZone: 'Europe/Paris', languages: ['fr'] })

    expect(opened).toEqual({ draft: emptyDraft('Europe/Paris', ['fr']), step: 'where' })
  })
})
