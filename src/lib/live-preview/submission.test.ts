import type { RegionNode } from '@/types'

import { describe, expect, it } from 'vitest'

import {
  PREVIEW_EVENT_ID,
  PreviewEventSchema,
  SUBMISSION_PREVIEW_PATH,
  readPreviewEvent,
  shapePreviewEvent,
} from './submission'

import { resolveStack } from '@/lib/shape'

// The populate body the library composes, with a submission's real form state inside it:
// SahajCloud posts the WHOLE document, not a curated payload.
const populateBody = (previewEvent: unknown) => ({
  data: {
    id: 42,
    type: 'proposal',
    uuid: 'b6f0-…',
    senderEmail: 'seeker@example.com',
    submissionData: [{ field: 'name', value: 'A Seeker' }],
    user: 91,
    screeningResult: { verdict: 'clean' },
    activityLog: [{ at: '2026-09-16T10:00:00.000Z', action: 'created' }],
    previewEvent,
  },
  depth: 0,
  flattenLocales: false,
  locale: 'en',
})

const cambridge: RegionNode = {
  id: 7,
  slug: 'cambridge',
  name: 'Cambridge',
  subtitle: null,
  level: 'city',
  parent: 3,
  webPath: '/gb/east/cambridge',
  webUrl: 'https://wemeditate.com/gb/east/cambridge',
}

// An update proposal: the target event merged with the patch. `images` arrives populated
// (SahajCloud#816) and `region` stays a bare id, so the reviewer's own diff keeps rendering
// row ids.
const mergedEvent = {
  id: 651,
  title: 'Evening Meditation',
  eventType: 'offline',
  languages: ['en'],
  region: 7,
  images: [
    { url: '/media/one.jpg', alt: 'One' },
    { url: '/media/two.jpg', alt: 'Two' },
  ],
  registrationMode: 'sahaj-atlas',
  webPath: '/gb/east/cambridge/651',
}

describe('readPreviewEvent', () => {
  it('reads previewEvent and nothing else off the message', () => {
    const body = populateBody(mergedEvent)

    expect(readPreviewEvent(body)).toEqual(mergedEvent)
    // The containment, stated the way it would fail: no key of the submission itself may
    // survive into what gets rendered, logged or cached.
    expect(JSON.stringify(readPreviewEvent(body))).not.toContain('seeker@example.com')
    expect(JSON.stringify(readPreviewEvent(body))).not.toContain('screeningResult')
  })

  it('answers null for a message carrying no previewEvent, and for junk', () => {
    expect(readPreviewEvent(populateBody(undefined))).toBeNull()
    expect(readPreviewEvent({ depth: 0 })).toBeNull()
    expect(readPreviewEvent(null)).toBeNull()
    expect(readPreviewEvent('previewEvent')).toBeNull()
  })
})

describe('PreviewEventSchema', () => {
  it('parses a new-event proposal, which names no id, title, region or registration mode', () => {
    const parsed = PreviewEventSchema.parse({
      languages: ['de'],
      eventType: 'online',
      inactive: false,
      _status: 'published',
    })

    expect(parsed.id).toBeUndefined()
    expect(parsed.title).toBeUndefined()
    expect(parsed.region).toBeUndefined()
    expect(parsed.registrationMode).toBeUndefined()
    expect(parsed.languages).toEqual(['de'])
  })

  it('keeps the rest of a proposal when its schedule is half a schedule', () => {
    const parsed = PreviewEventSchema.parse({
      ...mergedEvent,
      // `firstDate` is the group's one required field, and a patch can be mid-edit without it.
      schedule: { recurrenceType: 'WEEKLY', weekdays: ['WE'] },
    })

    expect(parsed.schedule).toBeNull()
    expect(parsed.title).toBe('Evening Meditation')
  })

  it('refuses a proposal that cleared a field the producer always supplies', () => {
    // `newEventDefaults` sets both, and an update proposal inherits its target's, so an absent
    // one is a clear — which Accept would refuse to write. Refusing here holds the last good
    // preview rather than inventing a value nobody is going to get.
    expect(PreviewEventSchema.safeParse({ ...mergedEvent, languages: null }).success).toBe(false)
    expect(PreviewEventSchema.safeParse({ ...mergedEvent, eventType: null }).success).toBe(false)
  })

  it('drops an image entry it cannot read, and keeps the rest of the proposal', () => {
    // A CMS that has not shipped SahajCloud#816 still posts bare ids. One costing the whole
    // array would cost the reviewer every photograph; one costing the parse would blank the
    // preview entirely.
    const parsed = PreviewEventSchema.parse({ ...mergedEvent, images: [11, mergedEvent.images[1]] })

    expect(parsed.images).toEqual([null, { url: '/media/two.jpg', alt: 'Two' }])
    expect(parsed.title).toBe('Evening Meditation')
  })
})

describe('shapePreviewEvent', () => {
  it('renders under the reserved id, never the target event’s', () => {
    const shaped = shapePreviewEvent(PreviewEventSchema.parse(mergedEvent))

    expect(shaped.id).toBe(PREVIEW_EVENT_ID)
    expect(shaped.id).not.toBe(651)
  })

  it('resolves the region off the wholesale tree', () => {
    const shaped = shapePreviewEvent(PreviewEventSchema.parse(mergedEvent), {
      regions: [cambridge],
    })

    expect(shaped.region?.slug).toBe('cambridge')
  })

  it('keeps a region the message already populated, without consulting the tree', () => {
    const shaped = shapePreviewEvent(
      PreviewEventSchema.parse({ ...mergedEvent, region: cambridge }),
    )

    expect(shaped.region?.slug).toBe('cambridge')
  })

  it('leaves the region null when the proposal names none, and fills the CMS defaults', () => {
    const newEvent = { eventType: 'online', languages: ['en'] }
    const shaped = shapePreviewEvent(PreviewEventSchema.parse(newEvent), { regions: [cambridge] })

    expect(shaped.region).toBeNull()
    expect(shaped.title).toBe('')
    expect(shaped.registrationMode).toBe('sahaj-atlas')
  })

  it('keeps the populated images in the event’s order, and leaves out an unreadable one', () => {
    const shaped = shapePreviewEvent(PreviewEventSchema.parse(mergedEvent))

    expect(shaped.images).toEqual(mergedEvent.images)

    const partial = shapePreviewEvent(
      PreviewEventSchema.parse({ ...mergedEvent, images: [11, mergedEvent.images[0]] }),
    )

    expect(partial.images).toEqual([{ url: '/media/one.jpg', alt: 'One' }])
  })
})

describe('SUBMISSION_PREVIEW_PATH', () => {
  // The whole reason the preview renders at all: `resolveStack` has to read this route as one
  // event drawer over the base view. `preview` is a RESERVED_SLUG and carries no drawer, so
  // the reserved id is what opens one.
  it('resolves to a single event drawer under the reserved id', () => {
    expect(resolveStack(SUBMISSION_PREVIEW_PATH)).toEqual([
      { kind: 'event', id: PREVIEW_EVENT_ID, path: SUBMISSION_PREVIEW_PATH },
    ])
  })
})
