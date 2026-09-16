import type { QueryClient } from '@tanstack/react-query'
import type { PreviewEvent } from '@/lib/live-preview'
import type { Event, EventDoc, Region, RegionNode } from '@/types'

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { useLivePreview } from '@payloadcms/live-preview-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Spinner } from '@/components/atoms/Spinner'
import { eventQuery, imagesQuery, regionQuery, regionsQuery } from '@/config/api'
import { API_BASE_URL, interceptFetch } from '@/config/api/client'
import { shapeEventDoc } from '@/config/api/fetch'
import livePreview, { LIVE_PREVIEW_COLLECTION } from '@/config/live-preview/protocol'
import { useLocale } from '@/hooks/use-locale'
import {
  PREVIEW_EVENT_ID,
  PreviewEventSchema,
  SUBMISSION_PREVIEW_PATH,
  allowedLivePreviewPaths,
  previewImageIds,
  readPreviewEvent,
  resolveLivePreviewTarget,
  shapePreviewEvent,
  shouldBlockPreviewLink,
} from '@/lib/live-preview'
import { overlayContainer } from '@/lib/overlay'
import { isCanonicalPath } from '@/lib/shape'
import { EventDocSchema, RegionNodeSchema } from '@/types'

// The CMS admin posts live edits from the SahajCloud origin, and `isLivePreviewEvent` compares
// `event.origin` against this exact string. (A trailing path or slash on the env value is
// tolerated via `.origin`.)
const SERVER_ORIGIN = new URL(import.meta.env.VITE_SAHAJCLOUD_URL).origin

/** What `mergeData` hands the request handler, narrowed to the two fields this reads. */
type PopulateRequest = { data: Record<string, unknown>; endpoint: string }

/**
 * Whether the populate endpoint the library composed names the document on screen.
 *
 * ⚠ **This is the whole document filter.** `useLivePreview` takes no collection, no id and no
 * predicate: it merges any message carrying a slug, and builds `endpoint` as
 * `<the message's collectionSlug>/<our initialData.id>` — so the collection half is whatever
 * the panel happens to be editing while the id half is ours. A missed check populates one
 * document's unsaved edits into the page showing another.
 *
 * An absent id refuses everything, which is what a region wants before its own read has
 * landed: the endpoint would otherwise address `regions/undefined`.
 */
export function namesPreviewedDoc(
  endpoint: string,
  collection: string,
  // A submission's id arrives as the `?id=` string off the boot URL, an event's as a number
  // off the cache. The endpoint is a string either way.
  id?: number | string,
): boolean {
  return id !== undefined && id !== '' && endpoint === `${collection}/${id}`
}

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

/**
 * The populate handler `useLivePreview` calls for each accepted message. It pushes the admin's
 * unsaved form state through Payload's populate endpoint — a GET behind a method override — so
 * relations and computed fields like `upcomingDates` resolve server-side, without saving.
 *
 * It goes through `interceptFetch`, so the API key, the live-preview token header and
 * `draft=true` attach in the one place every other SahajCloud request gets them. Payload's own
 * default handler is what this replaces: it sends `credentials: 'include'` for an admin cookie,
 * which a cross-origin widget has none of.
 *
 * ⚠ **It must never reject, and must always resolve JSON.** `mergeData` is
 * `requestHandler(…).then((res) => res.json())` with no catch and no status check, so a
 * rejection silently takes the subscription's callback with it, and an `{errors:[…]}` body
 * becomes the document the library caches and merges the next edit onto. Every refusal
 * therefore answers with the seed: `{ id }` alone fails the schema parse at the call site, so
 * the last good document stays on screen while the next message still populates under the
 * right id.
 */
function populateHandler(collection: 'events' | 'regions', id?: number) {
  const seed = () => jsonResponse({ id })

  return async ({ data, endpoint }: PopulateRequest): Promise<Response> => {
    if (!namesPreviewedDoc(endpoint, collection, id)) return seed()

    try {
      const response = await interceptFetch(`${API_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payload-HTTP-Method-Override': 'GET',
        },
        body: JSON.stringify(data),
      })

      return response.ok ? response : seed()
    } catch {
      return seed()
    }
  }
}

/**
 * This is a route lock. It keeps the preview pinned to the previewed doc.
 * If navigation lands outside the allowed set — a dismissed drawer
 * stranding on a parent, a button-driven route change — it snaps back to
 * `previewPath`. This effect is conditional, so re-running on an
 * already-allowed path is a no-op. So it never fights a legitimate register
 * or share drawer, even as react-router recreates `navigate` on each
 * navigation. An unconditional effect with `navigate` in its dependencies
 * would snap register or share straight back.
 *
 * It no longer performs an initial hop. The preview URL IS the document's
 * page now, so the widget is already where it belongs at mount.
 */
function useLivePreviewRouteLock(previewPath: string, kind: 'event' | 'region'): void {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    // This compares decoded values. `pathname` is percent-encoded for
    // accented slugs (for example, `/li%C3%A8ge/...`), while the allowed
    // set is decoded, built from webPath. So a raw `includes` would miss,
    // and snap every accented-slug preview back on each navigation.
    const allowed = allowedLivePreviewPaths(previewPath, kind)

    if (!allowed.some((path) => isCanonicalPath(pathname, path))) {
      navigate(previewPath, { replace: true })
    }
  }, [pathname, previewPath, kind, navigate])
}

/**
 * This is a capture-phase link guard. It makes every `<a>` in the preview
 * inert, except a same-page `#hash`, so a card, description, or CTA link
 * cannot navigate off the previewed doc. Register and Share are
 * `<button>`s, not anchors, so they stay live. This is ported from
 * WeMeditateWeb's `useLivePreviewLinkGuard`. It uses capture phase plus
 * `stopPropagation`, so it runs before react-router's own click handler,
 * and `auxclick` covers middle-click.
 */
function useLivePreviewLinkGuard(): void {
  useEffect(() => {
    const block = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest('a')

      if (!anchor || !shouldBlockPreviewLink(anchor.getAttribute('href'))) return

      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('click', block, true)
    window.addEventListener('auxclick', block, true)

    return () => {
      window.removeEventListener('click', block, true)
      window.removeEventListener('auxclick', block, true)
    }
  }, [])
}

// ── Cache writes ─────────────────────────────────────────────────────────────────

/**
 * This writes a live edit onto the key the drawer reads.
 *
 * ⚠ **A `setQueryData` under the wrong key is SILENT.** It creates the entry it was handed, no
 * reader ever asks for it, and nothing anywhere reports a miss. That is how the whole live-edit
 * pipeline shipped dead: the drawer keys were suffixed with the locale, these writes were not,
 * and every keystroke landed in an entry no view had ever subscribed to.
 * So both sides build the key from the same factory in `config/api`, and these are functions
 * rather than inline effects so the node lane can drive them against a real `QueryClient`.
 */
export function writeEventEdit(queryClient: QueryClient, locale: string, doc: EventDoc): void {
  queryClient.setQueryData(eventQuery(doc.id, locale).queryKey, shapeEventDoc(doc))
}

/**
 * This overlays a region's editable scalars onto the drawer's already-shaped `Region`.
 * Counts, bounds, and lists are geojson-derived, and cannot move from a form edit.
 * This returns false, and writes nothing, until the region read has populated the cache.
 */
export function writeRegionEdit(
  queryClient: QueryClient,
  locale: string,
  slug: string,
  node: RegionNode,
): boolean {
  const { queryKey } = regionQuery(slug, locale)
  const cached = queryClient.getQueryData<Region>(queryKey)

  if (!cached) return false

  queryClient.setQueryData<Region>(queryKey, {
    ...cached,
    name: node.name ?? cached.name,
    subtitle: node.subtitle,
    level: node.level,
  })

  return true
}

// ── Event preview ────────────────────────────────────────────────────────────────

function EventLivePreview({ id, previewPath }: { id: number; previewPath: string }) {
  const queryClient = useQueryClient()
  // The widget's own locale, which the boot URL's `locale` parameter has already set to the
  // one the admin is editing in. NOT the locale a message carries: that names the edit, while
  // this names the key the drawer on screen reads.
  const { locale } = useLocale()

  const initialData = useMemo(() => ({ id }), [id])
  const requestHandler = useMemo(() => populateHandler('events', id), [id])

  // There is no seed and no boot fetch. The route names the event, so `EventView`'s own
  // suspense read has already put the saved draft in the cache — under `draft=true`, because
  // the session is active. `initialData` only has to carry the id the endpoint is addressed
  // by; the populate response is a whole document, not a patch.
  //
  // Depth 1 brings the region and images back as objects, which is what `EventDocSchema`
  // expects.
  const { data } = useLivePreview({
    depth: 1,
    initialData,
    requestHandler,
    serverURL: SERVER_ORIGIN,
  })

  // On an invalid mid-edit state, a refused endpoint or a hiccup, the parse simply fails and
  // this writes nothing, leaving the cache on its last good doc.
  useEffect(() => {
    const parsed = EventDocSchema.safeParse(data)

    if (parsed.success) writeEventEdit(queryClient, locale, parsed.data)
  }, [data, locale, queryClient])

  useLivePreviewRouteLock(previewPath, 'event')

  return null
}

// ── Region preview ───────────────────────────────────────────────────────────────

function RegionLivePreview({ slug, previewPath }: { slug: string; previewPath: string }) {
  const queryClient = useQueryClient()
  const { locale } = useLocale()

  // The route carries a slug, and the populate endpoint is `POST /regions/:id`. This reads the
  // id off the drawer's own cache entry rather than fetching one: it is the same entry
  // `writeRegionEdit` overlays, so there is never a populate whose result has nowhere to go.
  // `enabled: false` subscribes without issuing a request — the drawer's read owns that.
  const { data: cached } = useQuery({ ...regionQuery(slug, locale), enabled: false })
  const id = cached?.id

  const initialData = useMemo(() => ({ id }), [id])
  const requestHandler = useMemo(() => populateHandler('regions', id), [id])

  // Regions have no drafts, so only editable scalars change, and this re-populates the edit for
  // a validated RegionNode before overlaying it.
  //
  // ⚠ **Depth MUST stay 0.** `RegionNodeSchema` types `parent` as `z.number().nullish()` — the
  // wholesale-tree shape. At depth 1 the CMS returns it populated, the whole document fails the
  // parse, and the overlay drops every message without a word. A region edit needs no relation
  // anyway.
  const { data } = useLivePreview({
    depth: 0,
    initialData,
    requestHandler,
    serverURL: SERVER_ORIGIN,
  })

  useEffect(() => {
    const parsed = RegionNodeSchema.safeParse(data)

    if (parsed.success) writeRegionEdit(queryClient, locale, slug, parsed.data)
  }, [data, locale, queryClient, slug])

  useLivePreviewRouteLock(previewPath, 'region')

  return null
}

// ── Submission preview (issue #163) ──────────────────────────────────────────────

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

function SubmissionLivePreview({ submissionId }: { submissionId: string }) {
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
  // a cache WRITE, so a failure there simply leaves the last good document alone. Here the
  // parse feeds render state, so returning null would put the skeleton back over an event the
  // reviewer was reading — and `previewEvent` is absent from every message about a row that
  // is not a proposal.
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

/**
 * This pins event and region query freshness while previewing. The
 * controller live-overlays the drawer's own cache entries via setQueryData.
 * Without this, a drawer's suspense query background-refetches on remount —
 * for example, after closing register or share — and overwrites unsaved live
 * edits with the last-saved doc. The client's `DEFAULT_STALE_TIME` only
 * postpones that. A preview session needs `Infinity`, and these prefix
 * defaults outrank the client's.
 */
function usePinnedLivePreviewQueries(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.setQueryDefaults(['event'], { staleTime: Infinity })
    queryClient.setQueryDefaults(['region'], { staleTime: Infinity })
  }, [queryClient])
}

/**
 * This is the live-preview controller (issue #40). It mounts only in a verified session,
 * lazily, from AppShell. It renders no drawer of its own. Instead, it drives the drawer
 * cache from the live doc, and disables navigation.
 *
 * ⚠ **Identity comes from the ROUTE, not from a boot parameter.** SahajCloud now points every
 * `livePreview.url` at the document's own page, so the path already says which document is on
 * screen and the normal drawer machinery has already fetched it. Taking identity from a
 * `?collection=&id=` pair instead would mean trusting a second, unauthenticated claim about
 * the URL, and then fetching a document the route was not showing.
 *
 * The one exception is `/preview`, where there is no document in the path — see below.
 *
 * ⚠ **`useLivePreview` cannot be told which document the page shows, and holds its merge cache
 * at module scope.** Both are safe here only because there is never more than one subscriber:
 * this returns `EventLivePreview` **or** `RegionLivePreview`, and the route lock plus
 * `allowedLivePreviewPaths` confine navigation to sub-paths of that same document, so the
 * target cannot change mid-session. Mounting a second arm — or keying one off anything but the
 * route — would put two subscriptions on one shared `previousData`. `namesPreviewedDoc` is
 * what each arm filters on in the meantime.
 */
export function LivePreviewController() {
  useLivePreviewLinkGuard()
  usePinnedLivePreviewQueries()

  // Read once, at mount. The route lock below is about to start pinning navigation to this
  // path, so re-deriving the target from a later location would let one stray navigation
  // redefine what is being previewed.
  const { pathname } = useLocation()
  const previewPath = useRef(pathname).current
  const target = useRef(resolveLivePreviewTarget(previewPath)).current

  // `/preview` is the boot route for `user-submissions`, the one collection with no page of
  // its own: a proposal is not published anywhere, and a new-event one has no Event id to
  // fetch. Its identity comes from the session the boot URL opened, not from the path, and
  // its content rides the message payload's `previewEvent` (#163).
  if (livePreview.collection === LIVE_PREVIEW_COLLECTION && livePreview.id) {
    return <SubmissionLivePreview submissionId={livePreview.id} />
  }

  // No document in the path and no submission session means only the guards above are in
  // force, and the reviewer gets the ordinary atlas rather than a broken fetch.
  if (!target) return null

  if (target.kind === 'event') {
    return <EventLivePreview id={target.id} previewPath={previewPath} />
  }

  return <RegionLivePreview previewPath={previewPath} slug={target.slug} />
}
