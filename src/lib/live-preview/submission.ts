import type { EventDoc, EventImage, EventImageDoc, RegionNode, RegionRef } from '@/types'

import z from 'zod'

import { LIVE_PREVIEW_PATH } from '@/config/live-preview/protocol'
import { EventDocSchema, EventImageSchema, EventScheduleSchema, RegionRefSchema } from '@/types'

/**
 * Live preview of a user submission: turning one `previewEvent` payload into an event the
 * drawer stack can render (issue #163).
 *
 * Pure — no React, no fetch. The arm that subscribes, hydrates and seeds the cache is
 * `<LivePreviewController>`. Everything here is a function of the message plus the relations
 * the caller already holds, so the node lane can drive it with no DOM and no network.
 */

/**
 * The event id a proposal previews under.
 *
 * A proposal is not an event. A new-event one has no id at all, and an update proposal's
 * merged shape is not what `events/<id>` would answer — so seeding the real id would put an
 * unsaved patch under the key the saved document reads. This id belongs to no row, which is
 * what makes `/preview/0` a route `resolveStack` opens as an event drawer while naming
 * nothing real.
 */
export const PREVIEW_EVENT_ID = 0

/** The route the drawer stack opens a previewed proposal at. */
export const SUBMISSION_PREVIEW_PATH = `${LIVE_PREVIEW_PATH}/${PREVIEW_EVENT_ID}`

/**
 * The ONE key this route may read off a live-preview message.
 *
 * Payload posts the whole document form state, and a submission's carries the submitter's
 * address, their note, the `user` relationship, the screening result and the activity log.
 * None of it has a use here, so the containment is this function: it takes `previewEvent` and
 * drops the rest before anything can render, log or store it. Do not widen it to "just pass
 * the message through" — a whole-payload log puts a submitter's email into Sentry.
 *
 * The argument is the populate request body the library composes, `{ data, depth, locale, … }`,
 * so the payload sits one level in.
 */
export function readPreviewEvent(populateBody: unknown): unknown {
  if (typeof populateBody !== 'object' || populateBody === null) return null

  const { data } = populateBody as { data?: unknown }

  if (typeof data !== 'object' || data === null) return null

  return (data as { previewEvent?: unknown }).previewEvent ?? null
}

/**
 * `previewEvent` as it arrives: an Events-shaped patch merged over its target, at depth 0.
 *
 * It is the same document `EventDocSchema` describes, minus the guarantees a SAVED event
 * carries. A new-event proposal starts from SahajCloud's `newEventDefaults`, which sets
 * neither an id, a title, a region nor a registration mode, and its relationships are still
 * bare ids. So each of those is optional here and filled in by {@link shapePreviewEvent} —
 * relaxing `EventDocSchema` itself would drop the contract check every fetched event depends
 * on.
 *
 * ⚠ **Relax nothing else.** `newEventDefaults` supplies `eventType` and `languages` on a
 * new-event proposal, and an update proposal inherits its target's, so a message missing one
 * is a cleared required field — which Accept would refuse to write. Refusing the parse holds
 * the last good preview (see `<SubmissionLivePreview>`); a fallback would show the reviewer a
 * value nobody is going to get.
 */
export const PreviewEventSchema = EventDocSchema.extend({
  id: z.number().nullish(),
  title: z.string().nullish(),
  registrationMode: EventDocSchema.shape.registrationMode.nullish(),
  region: z.union([z.number(), RegionRefSchema]).nullish(),
  images: z.array(z.union([z.number(), EventImageSchema])).nullish(),
  // A proposal is a patch, so its schedule can be half a schedule — and `firstDate` is the
  // one required field in the group. Dropping an unreadable schedule keeps the rest of the
  // proposal on screen, where failing the whole parse would show the reviewer nothing.
  schedule: EventScheduleSchema.nullish().catch(null),
})
export type PreviewEvent = z.infer<typeof PreviewEventSchema>

/** The image ids a proposal still carries unresolved — what the caller has to read back. */
export function previewImageIds(preview: PreviewEvent): number[] {
  return (preview.images ?? []).filter((image): image is number => typeof image === 'number')
}

function resolveRegion(preview: PreviewEvent, regions?: RegionNode[]): RegionRef | null {
  if (preview.region && typeof preview.region === 'object') return preview.region

  return regions?.find((node) => node.id === preview.region) ?? null
}

/**
 * Relationships resolve by id, because the populate endpoint is closed to this collection:
 * API clients hold create-only on `user-submissions`, so posting the form state back for
 * population is a certain 403. Regions come off the wholesale tree the widget already holds,
 * and images off their own read — both readable by `sahaj-atlas-client`.
 */
function resolveImages(preview: PreviewEvent, images?: EventImageDoc[]): EventImage[] {
  const byId = new Map((images ?? []).map((image) => [image.id, image]))

  return (preview.images ?? []).flatMap((image) => {
    if (typeof image !== 'number') return [image]

    const resolved = byId.get(image)

    return resolved ? [{ url: resolved.url, alt: resolved.alt }] : []
  })
}

/**
 * The merged proposal as an event document — everything but the shaping `fetch.ts` does for a
 * read, so the caller finishes it through `shapeEventDoc` and the two agree on image URLs.
 *
 * An unresolved relationship degrades rather than blocks: an image whose read has not landed
 * is left out, and a region that never resolves stays null. A proposal is a draft, and a
 * reviewer wants to see the parts of it that ARE there.
 */
export function shapePreviewEvent(
  preview: PreviewEvent,
  relations: { regions?: RegionNode[]; images?: EventImageDoc[] } = {},
): EventDoc {
  return {
    ...preview,
    id: PREVIEW_EVENT_ID,
    title: preview.title ?? '',
    registrationMode: preview.registrationMode ?? 'sahaj-atlas',
    region: resolveRegion(preview, relations.regions),
    images: resolveImages(preview, relations.images),
  }
}
