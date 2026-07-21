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

// The CMS admin posts live edits from the SahajCloud origin; every message is checked
// against it. (A trailing path/slash on the env value is tolerated via `.origin`.)
const SERVER_ORIGIN = new URL(import.meta.env.VITE_SAHAJCLOUD_URL).origin

/**
 * Minimal PayloadCMS live-preview transport (replacing @payloadcms/live-preview-react):
 * announce `ready` to the admin iframe, then hand each incoming form-state doc to
 * `onDoc`. Origin-locked to the CMS. We deliberately don't use the library's credentialed
 * cookie-auth relation re-population — the controller re-populates each edit through the
 * CMS with our own API-key + secret (`populatePreviewDoc`), which works over plain CORS.
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
 * Route lock: keep the preview pinned to the previewed doc. If navigation lands
 * outside the allowed set — a dismissed drawer stranding on a parent, a button-driven
 * route change — snap back to `previewPath`. This is the single navigation authority:
 * from the `/preview` boot route (never in the allowed set) it performs the initial hop
 * to the doc, then keeps the preview pinned. Being conditional, re-running on an already-
 * allowed path is a no-op — so it never fights a legit register/share drawer, even as
 * react-router recreates `navigate` on each navigation (an unconditional boot effect
 * with `navigate` in its deps would snap register/share straight back).
 */
function usePreviewRouteLock(previewPath: string, collection: 'events' | 'regions'): void {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    // Compare decoded: `pathname` is percent-encoded for accented slugs (e.g.
    // `/li%C3%A8ge/...`) while the allowed set is decoded (built from webPath), so a raw
    // `includes` would miss and snap every accented-slug preview back on each navigation.
    const allowed = allowedPreviewPaths(previewPath, collection)

    if (!allowed.some((path) => isCanonicalPath(pathname, path))) {
      navigate(previewPath, { replace: true })
    }
  }, [pathname, previewPath, collection, navigate])
}

/**
 * Capture-phase link guard: inert every `<a>` in the preview except a same-page
 * `#hash`, so a card/description/CTA link can't navigate off the previewed doc.
 * Register/Share are `<button>`s, not anchors, so they stay live. Ported from
 * WeMeditateWeb's `usePreviewLinkGuard` — capture phase + `stopPropagation` so it runs
 * before react-router's own click handler, and `auxclick` covers middle-click.
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

  // Live: push each edit through the CMS populate endpoint (relations + computed fields
  // like upcomingDates resolved server-side with our auth), then shape + inject. On an
  // invalid mid-edit state or a hiccup we simply skip, leaving the cache on its last
  // good doc.
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

  // The route lock performs the initial /preview -> event hop, then pins it — the normal
  // resolveStack / DrawerStack machinery renders map + drawer from the seeded cache.
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

  // Live: regions have no drafts, so only editable scalars change — re-populate the edit
  // (for a validated RegionNode) and overlay name/subtitle/level onto the cached shaped
  // Region. Counts/bounds/lists are geojson-derived and can't move from a form edit;
  // skips until the region read has populated the cache.
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

  // The route lock performs the initial /preview -> region hop (the normal getRegion(slug)
  // then fills ['region', slug]) and pins it thereafter.
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

// A brand-new unsaved doc has no id (standard Payload limitation): show a hint instead
// of crashing on the fetch.
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
 * Pin event/region query freshness while previewing. The controller seeds and live-
 * overlays ['event', id] / ['region', slug] via setQueryData; without this the global
 * staleTime of 0 lets a drawer's suspense query background-refetch on remount (e.g. after
 * closing register/share) and stomp unsaved live edits with the last-saved doc.
 */
function usePinnedPreviewQueries(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.setQueryDefaults(['event'], { staleTime: Infinity })
    queryClient.setQueryDefaults(['region'], { staleTime: Infinity })
  }, [queryClient])
}

/**
 * Live-preview controller (issue #40). Mounted only in preview mode (lazy, from
 * AppShell), it renders no drawer of its own — it drives the drawer cache + map camera
 * from the live doc and inerts navigation. Dispatches on the previewed collection.
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
