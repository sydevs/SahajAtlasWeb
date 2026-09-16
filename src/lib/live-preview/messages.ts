import type { ResolvedPath } from '@/lib/shape'

/**
 * Which document an unsaved edit is about, and whether that is the one on screen.
 *
 * Payload's live-preview transport is a broadcast: the panel posts its form state into the
 * frame, and the frame is on its own to work out whether the message concerns what it is
 * rendering. The SDK cannot help — `useLivePreview` takes no collection, no id and no
 * predicate, and `handleMessage` merges any message carrying either slug. WeMeditateWeb
 * reached the same conclusion and wrote the same filter (`lib/live-preview/messages.ts`).
 *
 * This is the filter, as a pure function, because it is the part that can be wrong quietly:
 * a missed check writes one document's unsaved edits over another's page.
 */

/** The document a preview route names. Exactly what `resolvePath` already answers. */
export type LivePreviewTarget = NonNullable<ResolvedPath>

/** The message shape this reads. A wider one is fine; these are the fields that decide. */
export type LivePreviewEdit = {
  collectionSlug?: string
  data?: Record<string, unknown>
}

/** A Payload id, which arrives as a number but is a string often enough to be worth allowing. */
function documentId(data: Record<string, unknown>): number | null {
  const { id } = data

  if (typeof id === 'number') return id
  if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id)

  return null
}

/**
 * The id to populate this edit under, or `null` when the edit is not about the document on
 * screen.
 *
 * The id is what the caller needs, and it comes off the MESSAGE rather than the route: an
 * event route carries the id already, but a region route carries a slug, and the populate
 * endpoint is `POST /regions/:id`. Identity is still decided by the route — the id for an
 * event, the slug for a region — so an edit to a sibling document is refused either way.
 */
export function editedDocumentId(
  target: LivePreviewTarget,
  message: LivePreviewEdit,
): number | null {
  const { collectionSlug, data } = message

  if (!data) return null

  const id = documentId(data)

  if (id === null) return null

  if (target.kind === 'event') {
    return collectionSlug === 'events' && id === target.id ? id : null
  }

  return collectionSlug === 'regions' && data.slug === target.slug ? id : null
}
