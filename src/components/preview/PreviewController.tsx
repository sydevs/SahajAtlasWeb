import type { EventDoc, Region, RegionNode } from '@/types'

import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import api from '@/config/api'
import { regionRoute, shapeEventDoc } from '@/config/api/fetch'
import preview from '@/config/preview'
import { allowedPreviewPaths, shouldBlockPreviewLink } from '@/lib/preview'
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
function usePreviewMessages(onDoc: (data: Record<string, unknown>, locale?: string) => void): void {
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
function usePreviewRouteLock(previewPath: string, collection: 'events' | 'regions'): void {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    // This compares decoded values. `pathname` is percent-encoded for
    // accented slugs (for example, `/li%C3%A8ge/...`), while the allowed
    // set is decoded, built from webPath. So a raw `includes` would miss,
    // and snap every accented-slug preview back on each navigation.
    const allowed = allowedPreviewPaths(previewPath, collection)

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
 * WeMeditateWeb's `usePreviewLinkGuard`. It uses capture phase plus
 * `stopPropagation`, so it runs before react-router's own click handler,
 * and `auxclick` covers middle-click.
 */
function usePreviewLinkGuard(): void {
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

// ── Event preview ────────────────────────────────────────────────────────────────

function EventLivePreview({ initialDoc }: { initialDoc: EventDoc }) {
  const queryClient = useQueryClient()

  const previewPath = safePath(initialDoc.webPath) ?? `/${initialDoc.id}`

  // Seed the drawer cache from the initial fetched doc.
  useEffect(() => {
    queryClient.setQueryData(['event', initialDoc.id], shapeEventDoc(initialDoc))
  }, [initialDoc, queryClient])

  // This is live: it pushes each edit through the CMS populate endpoint —
  // relations and computed fields like upcomingDates, resolved server-side
  // with our auth — then shapes and injects the result. On an invalid
  // mid-edit state or a hiccup, this simply skips, leaving the cache on its
  // last good doc.
  usePreviewMessages((data, locale) => {
    api
      .populatePreviewDoc('events', initialDoc.id, data, locale)
      .then((doc) => {
        const parsed = EventDocSchema.safeParse(doc)

        if (parsed.success) {
          queryClient.setQueryData(['event', parsed.data.id], shapeEventDoc(parsed.data))
        }
      })
      .catch(() => undefined)
  })

  // The route lock performs the initial /preview-to-event hop, then pins it.
  // The normal resolveStack and DrawerStack machinery renders the map and
  // drawer from the seeded cache.
  usePreviewRouteLock(previewPath, 'events')

  return null
}

function EventPreview({ id }: { id: number }) {
  const { data: doc } = useSuspenseQuery({
    queryKey: ['preview-event-doc', id],
    queryFn: () => api.getEventDoc(id),
  })

  return <EventLivePreview initialDoc={doc} />
}

// ── Region preview ───────────────────────────────────────────────────────────────

function RegionLivePreview({ initialDoc }: { initialDoc: RegionNode }) {
  const queryClient = useQueryClient()

  const { slug } = initialDoc
  const previewPath = regionRoute(initialDoc)

  // This is live: regions have no drafts, so only editable scalars change.
  // This re-populates the edit for a validated RegionNode, and overlays
  // name, subtitle, and level onto the cached shaped Region. Counts,
  // bounds, and lists are geojson-derived, and cannot move from a form
  // edit. This skips until the region read has populated the cache.
  usePreviewMessages((data, locale) => {
    api
      .populatePreviewDoc('regions', initialDoc.id, data, locale)
      .then((doc) => {
        const parsed = RegionNodeSchema.safeParse(doc)
        const cached = queryClient.getQueryData<Region>(['region', slug])

        if (parsed.success && cached) {
          queryClient.setQueryData<Region>(['region', slug], {
            ...cached,
            name: parsed.data.name ?? cached.name,
            subtitle: parsed.data.subtitle,
            level: parsed.data.level,
          })
        }
      })
      .catch(() => undefined)
  })

  // The route lock performs the initial /preview-to-region hop — the normal
  // getRegion(slug) then fills ['region', slug] — and pins it thereafter.
  usePreviewRouteLock(previewPath, 'regions')

  return null
}

function RegionPreview({ id }: { id: number }) {
  const { data: doc } = useSuspenseQuery({
    queryKey: ['preview-region-doc', id],
    queryFn: () => api.getRegionNodeById(id),
  })

  return <RegionLivePreview initialDoc={doc} />
}

// A brand-new unsaved doc has no id — a standard Payload limitation. This
// shows a hint instead of crashing on the fetch.
function PreviewFallback() {
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
 * controller seeds and live-overlays `['event', id]` and `['region', slug]`
 * via setQueryData. Without this, a drawer's suspense query
 * background-refetches on remount — for example, after closing register or
 * share — and overwrites unsaved live edits with the last-saved doc. The
 * client's `DEFAULT_STALE_TIME` only postpones that. A preview session
 * needs `Infinity`, and these prefix defaults outrank the client's.
 */
function usePinnedPreviewQueries(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.setQueryDefaults(['event'], { staleTime: Infinity })
    queryClient.setQueryDefaults(['region'], { staleTime: Infinity })
  }, [queryClient])
}

/**
 * This is the live-preview controller (issue #40). It mounts only in
 * preview mode, lazily, from AppShell. It renders no drawer of its own.
 * Instead, it drives the drawer cache and map camera from the live doc,
 * and disables navigation. It dispatches on the previewed collection.
 */
export function PreviewController() {
  usePreviewLinkGuard()
  usePinnedPreviewQueries()

  const id = preview.id ? Number(preview.id) : NaN

  if (!preview.id || Number.isNaN(id)) return <PreviewFallback />
  if (preview.collection === 'events') return <EventPreview id={id} />
  if (preview.collection === 'regions') return <RegionPreview id={id} />

  return <PreviewFallback />
}
