import type { RegionNode } from '@/types'

import { describe, expect, it } from 'vitest'

import {
  PREVIEW_EVENT_ID,
  PreviewEventSchema,
  SUBMISSION_PREVIEW_PATH,
  previewImageIds,
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

// An update proposal: the target event merged with the patch, relationships still bare ids.
const mergedEvent = {
  id: 651,
  title: 'Evening Meditation',
  eventType: 'offline',
  languages: ['en'],
  region: 7,
  images: [11, 12],
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

  it('reads a relationship as an id or as a document', () => {
    expect(previewImageIds(PreviewEventSchema.parse(mergedEvent))).toEqual([11, 12])
    // Only the ids are a gap the caller has to read back — one already populated is not.
    const mixed = { ...mergedEvent, images: [11, { url: '/media/two.jpg', alt: 'Two' }] }

    expect(previewImageIds(PreviewEventSchema.parse(mixed))).toEqual([11])
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
    const shaped = shapePreviewEvent(PreviewEventSchema.parse({ languages: ['en'] }), {
      regions: [cambridge],
    })

    expect(shaped.region).toBeNull()
    expect(shaped.title).toBe('')
    expect(shaped.eventType).toBe('offline')
    expect(shaped.registrationMode).toBe('sahaj-atlas')
  })

  it('resolves images by id, and drops one whose read has not landed', () => {
    const shaped = shapePreviewEvent(PreviewEventSchema.parse(mergedEvent), {
      images: [{ id: 12, url: '/media/two.jpg', alt: 'Two' }],
    })

    expect(shaped.images).toEqual([{ url: '/media/two.jpg', alt: 'Two' }])
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
