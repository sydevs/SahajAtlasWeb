import { describe, it, expect } from 'vitest'

import { EventDocSchema, EventSchema, EventSlimSchema, FeedEventSchema } from './event'

import { mockEvent, mockEventSlim, mockEventSlimList } from '@/mocks/events'

// The fetchers parse every response through these schemas (src/config/api/fetch.ts),
// so a SahajCloud shape change should surface here as a parse error, not a runtime
// crash deep in the UI. We reuse the Ladle mocks (typed against the same schemas)
// as the happy-path fixtures and add a raw-wire payload to prove date coercion.

describe('EventSlimSchema', () => {
  it('parses the slim list fixtures', () => {
    expect(EventSlimSchema.array().parse(mockEventSlimList)).toHaveLength(mockEventSlimList.length)
  })

  it('coerces ISO date strings in the schedule into Date objects', () => {
    const parsed = EventSlimSchema.parse({
      ...mockEventSlim,
      schedule: {
        firstDate: '2026-01-10T09:30:00Z',
        firstDate_tz: 'Europe/London',
        upcomingDates: ['2026-07-04T09:30:00Z'],
      },
    })

    expect(parsed.schedule?.firstDate).toBeInstanceOf(Date)
    expect(parsed.schedule?.upcomingDates?.[0].toISOString()).toBe('2026-07-04T09:30:00.000Z')
  })

  it('rejects an unknown recurrence type', () => {
    expect(() =>
      EventSlimSchema.parse({
        ...mockEventSlim,
        schedule: { ...mockEventSlim.schedule, recurrenceType: 'FORTNIGHTLY' },
      }),
    ).toThrow()
  })

  it('rejects an unknown event type', () => {
    expect(() => EventSlimSchema.parse({ ...mockEventSlim, eventType: 'hybrid' })).toThrow()
  })
})

describe('FeedEventSchema', () => {
  it('parses a feed event (the geojson feature properties), dropping derived fields', () => {
    const parsed = FeedEventSchema.parse(mockEventSlim)

    expect(parsed.id).toBe(mockEventSlim.id)
    expect('path' in parsed).toBe(false)
  })
})

describe('EventSchema', () => {
  it('parses the full event fixture (schedule / region / images / description)', () => {
    const parsed = EventSchema.parse(mockEvent)

    expect(parsed.id).toBe(mockEvent.id)
    expect(parsed.region.slug).toBe('cambridge')
  })

  it('rejects a missing required field', () => {
    expect(() => EventSchema.parse({ ...mockEvent, title: undefined })).toThrow()
  })
})

describe('EventDocSchema images', () => {
  // The real wire shape: `getEvent` selects `filename` (so SahajCloud's virtual
  // `url` resolves) and the dev backend returns a relative `url`. `filename` is
  // not part of the schema — it's dropped — and `url` is retained as-is.
  it('parses an image with filename + relative url, keeping url and dropping filename', () => {
    const parsed = EventDocSchema.parse({
      ...mockEvent,
      images: [
        { id: 2, filename: 'picture-9.jpg', url: '/api/images/file/picture-9.jpg', alt: 'Hall' },
      ],
    })

    expect(parsed.images[0].url).toBe('/api/images/file/picture-9.jpg')
    expect(parsed.images[0]).not.toHaveProperty('filename')
    expect(parsed.images[0].alt).toBe('Hall')
  })

  it('tolerates a null image url so a file-less image cannot crash the event read', () => {
    const parsed = EventDocSchema.parse({
      ...mockEvent,
      images: [{ id: 3, url: null, alt: 'no file' }],
    })

    expect(parsed.images[0].url).toBeNull()
  })
})
