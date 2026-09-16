import { describe, it, expect } from 'vitest'

import { editedDocumentId } from './messages'

/**
 * The filter between the panel's broadcast and this page's cache.
 *
 * ⚠ **Every `null` here is a write that would otherwise land on the wrong document.** The
 * panel posts its form state into the frame whatever it is editing, and the frame has to
 * decide on its own — Payload's own SDK cannot, since `handleMessage` merges any message
 * carrying a matching slug and takes no id at all.
 */
const EVENT = { kind: 'event', id: 507 } as const
const REGION = { kind: 'region', slug: 'pune' } as const

describe('editedDocumentId', () => {
  it('accepts an edit to the event on screen, and hands back its id', () => {
    expect(editedDocumentId(EVENT, { collectionSlug: 'events', data: { id: 507 } })).toBe(507)
  })

  it('accepts an edit to the region on screen, keyed by slug, and hands back its id', () => {
    // The route carries a slug; the populate endpoint is `POST /regions/:id`. So identity and
    // the value returned come from different places on purpose.
    expect(
      editedDocumentId(REGION, { collectionSlug: 'regions', data: { id: 42, slug: 'pune' } }),
    ).toBe(42)
  })

  it('refuses a sibling document of the same collection', () => {
    expect(editedDocumentId(EVENT, { collectionSlug: 'events', data: { id: 508 } })).toBeNull()
    expect(
      editedDocumentId(REGION, { collectionSlug: 'regions', data: { id: 43, slug: 'mumbai' } }),
    ).toBeNull()
  })

  it('refuses another collection entirely, including the two that are not documents here', () => {
    expect(editedDocumentId(EVENT, { collectionSlug: 'regions', data: { id: 507 } })).toBeNull()
    expect(
      editedDocumentId(REGION, { collectionSlug: 'events', data: { id: 42, slug: 'pune' } }),
    ).toBeNull()
    expect(
      editedDocumentId(EVENT, { collectionSlug: 'event-submissions', data: { id: 507 } }),
    ).toBeNull()
  })

  it('refuses a message that names no collection at all', () => {
    // A global's message carries `globalSlug` and no `collectionSlug`. Treating an absent
    // slug as "must be mine" is how the site config gets merged into a page.
    expect(editedDocumentId(EVENT, { data: { id: 507 } })).toBeNull()
  })

  it('refuses a message with no usable id, and accepts a numeric string', () => {
    expect(editedDocumentId(EVENT, { collectionSlug: 'events', data: {} })).toBeNull()
    expect(editedDocumentId(EVENT, { collectionSlug: 'events', data: { id: 'new' } })).toBeNull()
    expect(editedDocumentId(EVENT, { collectionSlug: 'events', data: { id: '507' } })).toBe(507)
  })

  it('refuses a message with no data', () => {
    expect(editedDocumentId(EVENT, { collectionSlug: 'events' })).toBeNull()
  })
})
