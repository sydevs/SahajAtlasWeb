import type { QueryClient } from '@tanstack/react-query'
import type { EventDoc, Region, RegionNode } from '@/types'

import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import api, { eventQuery, regionQuery } from '@/config/api'
import { regionRoute, shapeEventDoc } from '@/config/api/fetch'
import livePreview from '@/config/live-preview/session'
import { useLocale } from '@/hooks/use-locale'
import { allowedLivePreviewPaths, shouldBlockPreviewLink } from '@/lib/live-preview'
import { isCanonicalPath, safePath } from '@/lib/shape'
import { EventDocSchema, RegionNodeSchema } from '@/types'

// The CMS admin posts live edits from the SahajCloud origin. This checks
// every message against it. (A trailing path or slash on the env value is
// tolerated via `.origin`.)
const SERVER_ORIGIN = new URL(import.meta.env.VITE_SAHAJCLOUD_URL).origin

/**
 * This is a minimal PayloadCMS live-preview transport, replacing
 * @payloadcms/live-preview-react. It announces `ready` to the admin
 * iframe, then hands each incoming form-state doc to `onDoc`. It is
 * origin-locked to the CMS. This deliberately does not use the library's
 * credentialed cookie-auth relation re-population. Instead, the controller
 * re-populates each edit through the CMS with our own API key and secret
 * (`populatePreviewDoc`), which works over plain CORS.
 */
function useLivePreviewMessages(
  onDoc: (data: Record<string, unknown>, locale?: string) => void,
): void {
  // Keep the latest callback without re-subscribing the listener each render.
  const latest = useRef(onDoc)

  latest.current = onDoc

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== SERVER_ORIGIN) return
      const message = event.data

      if (message?.type !== 'payload-live-preview' || !message.data) return

      latest.current(message.data, message.locale)
    }

    window.addEventListener('message', onMessage)
    // Announce readiness to the admin (iframe parent, or popup opener).
    ;(window.opener || window.parent)?.postMessage(
      { type: 'payload-live-preview', ready: true },
      SERVER_ORIGIN,
    )

    return () => window.removeEventListener('message', onMessage)
  }, [])
}

/**
 * This is a route lock. It keeps the preview pinned to the previewed doc.
 * If navigation lands outside the allowed set — a dismissed drawer
 * stranding on a parent, a button-driven route change — it snaps back to
 * `previewPath`. This is the single navigation authority. From the
 * `/preview` boot route, never in the allowed set, it performs the initial
 * hop to the doc, then keeps the preview pinned. This effect is
 * conditional, so re-running on an already-allowed path is a no-op. So it
 * never fights a legitimate register or share drawer, even as react-router
 * recreates `navigate` on each navigation. An unconditional boot effect
 * with `navigate` in its dependencies would snap register or share
 * straight back.
 */
function useLivePreviewRouteLock(previewPath: string, collection: 'events' | 'regions'): void {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    // This compares decoded values. `pathname` is percent-encoded for
    // accented slugs (for example, `/li%C3%A8ge/...`), while the allowed
    // set is decoded, built from webPath. So a raw `includes` would miss,
    // and snap every accented-slug preview back on each navigation.
    const allowed = allowedLivePreviewPaths(previewPath, collection)

    if (!allowed.some((path) => isCanonicalPath(pathname, path))) {
      navigate(previewPath, { replace: true })
    }
  }, [pathname, previewPath, collection, navigate])
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

function EventLivePreview({ initialDoc }: { initialDoc: EventDoc }) {
  const queryClient = useQueryClient()
  // The widget's own locale, which the boot URL's `locale` parameter has already set to the
  // one the admin is editing in. NOT the locale a message carries: that names the edit, while
  // this names the key the drawer on screen reads.
  const { locale } = useLocale()

  const previewPath = safePath(initialDoc.webPath) ?? `/${initialDoc.id}`

  // Seed the drawer cache from the initial fetched doc.
  useEffect(() => {
    writeEventEdit(queryClient, locale, initialDoc)
  }, [initialDoc, locale, queryClient])

  // This is live: it pushes each edit through the CMS populate endpoint —
  // relations and computed fields like upcomingDates, resolved server-side
  // with our auth — then shapes and injects the result. On an invalid
  // mid-edit state or a hiccup, this simply skips, leaving the cache on its
  // last good doc.
  useLivePreviewMessages((data, editLocale) => {
    api
      .populatePreviewDoc('events', initialDoc.id, data, editLocale)
      .then((doc) => {
        const parsed = EventDocSchema.safeParse(doc)

        if (parsed.success) writeEventEdit(queryClient, locale, parsed.data)
      })
      .catch(() => undefined)
  })

  // The route lock performs the initial /preview-to-event hop, then pins it.
  // The normal resolveStack and DrawerStack machinery renders the map and
  // drawer from the seeded cache.
  useLivePreviewRouteLock(previewPath, 'events')

  return null
}

function EventLivePreviewBoot({ id }: { id: number }) {
  const { data: doc } = useSuspenseQuery({
    queryKey: ['preview-event-doc', id],
    queryFn: () => api.getEventDoc(id),
  })

  return <EventLivePreview initialDoc={doc} />
}

// ── Region preview ───────────────────────────────────────────────────────────────

function RegionLivePreview({ initialDoc }: { initialDoc: RegionNode }) {
  const queryClient = useQueryClient()
  const { locale } = useLocale()

  const { slug } = initialDoc
  const previewPath = regionRoute(initialDoc)

  // This is live: regions have no drafts, so only editable scalars change.
  // This re-populates the edit for a validated RegionNode, then overlays it.
  useLivePreviewMessages((data, editLocale) => {
    api
      .populatePreviewDoc('regions', initialDoc.id, data, editLocale)
      .then((doc) => {
        const parsed = RegionNodeSchema.safeParse(doc)

        if (parsed.success) writeRegionEdit(queryClient, locale, slug, parsed.data)
      })
      .catch(() => undefined)
  })

  // The route lock performs the initial /preview-to-region hop — the normal
  // region read then fills the drawer's cache — and pins it thereafter.
  useLivePreviewRouteLock(previewPath, 'regions')

  return null
}

function RegionLivePreviewBoot({ id }: { id: number }) {
  const { data: doc } = useSuspenseQuery({
    queryKey: ['preview-region-doc', id],
    queryFn: () => api.getRegionNodeById(id),
  })

  return <RegionLivePreview initialDoc={doc} />
}

// A brand-new unsaved doc has no id — a standard Payload limitation. This
// shows a hint instead of crashing on the fetch.
function LivePreviewFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 text-center">
      <p className="rounded-medium shadow-medium bg-background/90 px-4 py-3 text-sm text-gray-11">
        Save this document to preview it.
      </p>
    </div>
  )
}

/**
 * This pins event and region query freshness while previewing. The
 * controller seeds and live-overlays the drawer's own cache entries via
 * setQueryData. Without this, a drawer's suspense query
 * background-refetches on remount — for example, after closing register or
 * share — and overwrites unsaved live edits with the last-saved doc. The
 * client's `DEFAULT_STALE_TIME` only postpones that. A preview session
 * needs `Infinity`, and these prefix defaults outrank the client's.
 */
function usePinnedLivePreviewQueries(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.setQueryDefaults(['event'], { staleTime: Infinity })
    queryClient.setQueryDefaults(['region'], { staleTime: Infinity })
  }, [queryClient])
}

/**
 * This is the live-preview controller (issue #40). It mounts only in
 * a live-preview session, lazily, from AppShell. It renders no drawer of its own.
 * Instead, it drives the drawer cache and map camera from the live doc,
 * and disables navigation. It dispatches on the previewed collection.
 */
export function LivePreviewController() {
  useLivePreviewLinkGuard()
  usePinnedLivePreviewQueries()

  const id = livePreview.id ? Number(livePreview.id) : NaN

  if (!livePreview.id || Number.isNaN(id)) return <LivePreviewFallback />
  if (livePreview.collection === 'events') return <EventLivePreviewBoot id={id} />
  if (livePreview.collection === 'regions') return <RegionLivePreviewBoot id={id} />

  return <LivePreviewFallback />
}
