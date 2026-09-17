import type { QueryClient } from '@tanstack/react-query'
import type { EventDoc, Region, RegionNode } from '@/types'

import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router'
import { useLivePreview } from '@payloadcms/live-preview-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { SERVER_ORIGIN, populateHandler } from './populate'
import { useLivePreviewRouteLock } from './route-lock'
import { SubmissionLivePreview } from './SubmissionLivePreview'

import { eventQuery, regionQuery } from '@/config/api'
import { shapeEventDoc } from '@/config/api/fetch'
import livePreview, { LIVE_PREVIEW_COLLECTION } from '@/config/live-preview/protocol'
import { useLocale } from '@/hooks/use-locale'
import { resolveLivePreviewTarget, shouldBlockPreviewLink } from '@/lib/live-preview'
import { EventDocSchema, RegionNodeSchema } from '@/types'

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
 * It owns the guards every session shares and then picks ONE arm. Each arm is a subscription
 * with its own populate handler, its own parse and its own place to put the result, so the
 * choice below is the whole relationship between them.
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
 * this returns one arm, and the route lock plus `allowedLivePreviewPaths` confine navigation to
 * sub-paths of that same document, so the target cannot change mid-session. Mounting a second
 * arm — or keying one off anything but the route — would put two subscriptions on one shared
 * `previousData`. `namesPreviewedDoc` is what each arm filters on in the meantime.
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
