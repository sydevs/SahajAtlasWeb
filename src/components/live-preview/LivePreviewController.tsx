import type { QueryClient } from '@tanstack/react-query'
import type { EventDoc, Region, RegionNode } from '@/types'

import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'

import api, { eventQuery, regionQuery } from '@/config/api'
import { shapeEventDoc } from '@/config/api/fetch'
import { useLocale } from '@/hooks/use-locale'
import {
  allowedLivePreviewPaths,
  editedDocumentId,
  resolveLivePreviewTarget,
  shouldBlockPreviewLink,
} from '@/lib/live-preview'
import { isCanonicalPath } from '@/lib/shape'
import { EventDocSchema, RegionNodeSchema } from '@/types'

// The CMS admin posts live edits from the SahajCloud origin. This checks
// every message against it. (A trailing path or slash on the env value is
// tolerated via `.origin`.)
const SERVER_ORIGIN = new URL(import.meta.env.VITE_SAHAJCLOUD_URL).origin

/** One unsaved edit, as Payload's live-preview transport delivers it. */
type LivePreviewMessage = {
  collectionSlug?: string
  data: Record<string, unknown>
  locale?: string
}

/**
 * This is a minimal PayloadCMS live-preview transport, replacing
 * @payloadcms/live-preview-react. It announces `ready` to the admin
 * iframe, then hands each incoming form-state message to `onMessage`. It is
 * origin-locked to the CMS. This deliberately does not use the library's
 * credentialed cookie-auth relation re-population. Instead, the controller
 * re-populates each edit through the CMS with our own API key and token
 * (`populatePreviewDoc`), which works over plain CORS.
 *
 * The whole message is handed on, not just its `data`. `collectionSlug` is
 * what names the document an edit is about, and it is the only thing that
 * can: the panel is free to be editing something other than what this route
 * renders.
 */
function useLivePreviewMessages(onMessage: (message: LivePreviewMessage) => void): void {
  // Keep the latest callback without re-subscribing the listener each render.
  const latest = useRef(onMessage)

  latest.current = onMessage

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== SERVER_ORIGIN) return
      const message = event.data

      if (message?.type !== 'payload-live-preview' || !message.data) return

      latest.current(message as LivePreviewMessage)
    }

    window.addEventListener('message', listener)
    // Announce readiness to the admin (iframe parent, or popup opener).
    ;(window.opener || window.parent)?.postMessage(
      { type: 'payload-live-preview', ready: true },
      SERVER_ORIGIN,
    )

    return () => window.removeEventListener('message', listener)
  }, [])
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

  // There is no seed and no boot fetch. The route names the event, so `EventView`'s own
  // suspense read has already put the saved draft in the cache — under `draft=true`, because
  // the session is active. This only has to overlay what is not saved yet.
  //
  // This is live: it pushes each edit through the CMS populate endpoint —
  // relations and computed fields like upcomingDates, resolved server-side
  // with our auth — then shapes and injects the result. On an invalid
  // mid-edit state or a hiccup, this simply skips, leaving the cache on its
  // last good doc.
  useLivePreviewMessages(({ collectionSlug, data, locale: editLocale }) => {
    if (editedDocumentId({ kind: 'event', id }, { collectionSlug, data }) === null) return

    api
      .populatePreviewDoc('events', id, data, editLocale)
      .then((doc) => {
        const parsed = EventDocSchema.safeParse(doc)

        if (parsed.success) writeEventEdit(queryClient, locale, parsed.data)
      })
      .catch(() => undefined)
  })

  useLivePreviewRouteLock(previewPath, 'event')

  return null
}

// ── Region preview ───────────────────────────────────────────────────────────────

function RegionLivePreview({ slug, previewPath }: { slug: string; previewPath: string }) {
  const queryClient = useQueryClient()
  const { locale } = useLocale()

  // This is live: regions have no drafts, so only editable scalars change.
  // This re-populates the edit for a validated RegionNode, then overlays it.
  //
  // The id comes off the message rather than the route, because a slug is what a path
  // carries and `POST /regions/:id` is what the populate endpoint is. The slug is still what
  // decides whether the edit is about THIS region.
  useLivePreviewMessages(({ collectionSlug, data, locale: editLocale }) => {
    const id = editedDocumentId({ kind: 'region', slug }, { collectionSlug, data })

    if (id === null) return

    api
      .populatePreviewDoc('regions', id, data, editLocale)
      .then((doc) => {
        const parsed = RegionNodeSchema.safeParse(doc)

        if (parsed.success) writeRegionEdit(queryClient, locale, slug, parsed.data)
      })
      .catch(() => undefined)
  })

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
 * ⚠ **Identity comes from the ROUTE, not from a boot parameter.** SahajCloud now points every
 * `livePreview.url` at the document's own page, so the path already says which document is on
 * screen and the normal drawer machinery has already fetched it. Taking identity from a
 * `?collection=&id=` pair instead would mean trusting a second, unauthenticated claim about
 * the URL, and then fetching a document the route was not showing.
 *
 * The one exception is `/preview`, where there is no document in the path — see below.
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

  // No document in the path means only the guards above are in force, and the reviewer gets
  // the ordinary atlas rather than a broken fetch. `/preview` lands here: it is the boot route
  // for `event-submissions`, the one collection with no page of its own, whose render-ready
  // shape rides the message payload's `previewEvent`. Nothing here consumes that yet —
  // `SahajCloud#723` owns it.
  if (!target) return null

  if (target.kind === 'event') {
    return <EventLivePreview id={target.id} previewPath={previewPath} />
  }

  return <RegionLivePreview previewPath={previewPath} slug={target.slug} />
}
