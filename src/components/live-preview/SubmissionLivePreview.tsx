import type { PopulateRequest } from './populate'
import type { PreviewEvent } from '@/lib/live-preview'
import type { Event } from '@/types'

import { useLayoutEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLivePreview } from '@payloadcms/live-preview-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { SERVER_ORIGIN, jsonResponse, namesPreviewedDoc } from './populate'
import { useLivePreviewRouteLock } from './route-lock'

import { Spinner } from '@/components/atoms/Spinner'
import { eventQuery, imagesQuery, regionsQuery } from '@/config/api'
import { shapeEventDoc } from '@/config/api/fetch'
import { LIVE_PREVIEW_COLLECTION } from '@/config/live-preview/protocol'
import { useLocale } from '@/hooks/use-locale'
import {
  PREVIEW_EVENT_ID,
  PreviewEventSchema,
  SUBMISSION_PREVIEW_PATH,
  previewImageIds,
  readPreviewEvent,
  shapePreviewEvent,
} from '@/lib/live-preview'
import { overlayContainer } from '@/lib/overlay'

/**
 * The submission arm of live preview (issue #163): a proposal, rendered from the message alone.
 *
 * It is a whole arm rather than a branch inside `<LivePreviewController>` because nothing it
 * does is shared with the event and region arms. Those two populate against the CMS and write
 * the drawer's own cache entry; this one answers the populate in the browser, keeps no saved
 * document to fall back on, and renders its own waiting state. What the three DO share is the
 * populate filter (`./populate`) and the route lock (`./route-lock`).
 */

/**
 * The populate handler for a proposal — the one that never leaves the browser.
 *
 * `mergeData` is only ever `requestHandler(…).then((res) => res.json())`, so answering it
 * locally is what turns the library's populate round trip into a pure read of the message.
 * That is not an optimization: API clients hold **create-only** on `user-submissions`, so
 * posting the form state back for population is a certain 403, and a new-event proposal has
 * no Event id to fetch instead.
 *
 * ⚠ **The answer keeps the SUBMISSION's id and nests the event under it.** The library caches
 * what it returns and addresses the next populate at `<collection>/<that result's id>`, so
 * answering with the merged event directly would re-address the second message at the event's
 * id and `namesPreviewedDoc` would refuse every edit after the first.
 *
 * `readPreviewEvent` is the PII containment — see its own note.
 */
function submissionHandler(submissionId: string) {
  const seed = () => jsonResponse({ id: submissionId })

  return async ({ data, endpoint }: PopulateRequest): Promise<Response> => {
    if (!namesPreviewedDoc(endpoint, LIVE_PREVIEW_COLLECTION, submissionId)) return seed()

    try {
      return jsonResponse({ id: submissionId, previewEvent: readPreviewEvent(data) })
    } catch {
      // A structured clone can carry a cycle, and `JSON.stringify` throws on one. The
      // library's listener holds no catch, so a throw here would end the subscription.
      return seed()
    }
  }
}

/**
 * What the reviewer sees before the first message lands. There is no document to fetch and no
 * route to resolve, so the ordinary atlas underneath would read as the answer rather than as
 * the wait.
 */
function SubmissionPreviewSkeleton() {
  const container = overlayContainer()

  if (!container) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <Spinner />
    </div>,
    container,
  )
}

/**
 * Puts the merged proposal where the drawer stack reads an event from, then pins the route to
 * it.
 *
 * ⚠ **The seed is a LAYOUT effect and the route lock is a passive one**, so the cache entry
 * always exists before the navigation that renders `EventView` against it. Reversed, the
 * view's suspense read would miss and fetch `events/0`, which is a 404.
 */
function SubmissionPreviewRoute({ event }: { event: Event }) {
  const queryClient = useQueryClient()
  const { locale } = useLocale()

  useLayoutEffect(() => {
    queryClient.setQueryData(eventQuery(PREVIEW_EVENT_ID, locale).queryKey, event)
  }, [event, locale, queryClient])

  useLivePreviewRouteLock(SUBMISSION_PREVIEW_PATH, 'event')

  return null
}

export function SubmissionLivePreview({ submissionId }: { submissionId: string }) {
  const { locale } = useLocale()
  const initialData = useMemo(() => ({ id: submissionId }), [submissionId])
  const requestHandler = useMemo(() => submissionHandler(submissionId), [submissionId])
  const lastPreview = useRef<PreviewEvent | null>(null)

  // Depth 0: nothing is populated server-side here, so this only rides along in a request
  // body the handler above answers without sending.
  const { data } = useLivePreview<{ id: string; previewEvent?: unknown }>({
    depth: 0,
    initialData,
    requestHandler,
    serverURL: SERVER_ORIGIN,
  })

  // ⚠ **A refused message must not un-render the previous one.** The event arm's parse gates
  // a cache WRITE, so a failure there leaves the last good document alone. Here it feeds
  // render state instead. `mergeData` hands back whatever the handler answered and merges
  // nothing of its own, so every `seed()` above — a message naming another collection, a
  // payload `JSON.stringify` refuses — arrives as `{ id }` and would otherwise drop the
  // skeleton over an event the reviewer was reading.
  const preview = useMemo(() => {
    const parsed = PreviewEventSchema.safeParse(data?.previewEvent)

    if (parsed.success) lastPreview.current = parsed.data

    return lastPreview.current
  }, [data])

  // The relationships the message carries as bare ids. The tree is already cached on any
  // session that rendered the atlas; this read is what makes a cold one correct.
  const { data: regions } = useQuery(regionsQuery())
  const imageIds = useMemo(() => (preview ? previewImageIds(preview) : []), [preview])
  const { data: images } = useQuery({
    ...imagesQuery(imageIds, locale),
    enabled: imageIds.length > 0,
  })

  const event = useMemo(() => {
    if (!preview) return null

    // `shapeEventDoc` resolves the image URLs, and keys the path off `webPath` — which names
    // the TARGET event's page, not this proposal. The route is the reserved preview one.
    return {
      ...shapeEventDoc(shapePreviewEvent(preview, { images, regions })),
      path: SUBMISSION_PREVIEW_PATH,
    }
  }, [preview, images, regions])

  if (!event) return <SubmissionPreviewSkeleton />

  return <SubmissionPreviewRoute event={event} />
}
