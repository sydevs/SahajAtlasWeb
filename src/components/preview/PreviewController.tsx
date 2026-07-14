import type { EventDoc, Region, RegionDoc } from '@/types'

import { useEffect, useRef } from 'react'
import { useLivePreview } from '@payloadcms/live-preview-react'
import { useLocation, useNavigate } from 'react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import api from '@/config/api'
import { shapeEventDoc } from '@/config/api/fetch'
import preview from '@/config/preview'
import { allowedPreviewPaths, mergePreviewData, shouldBlockPreviewLink } from '@/lib/preview'
import { safePath } from '@/lib/shape'
import { EventDocSchema } from '@/types'

// The CMS admin posts live doc updates from the SahajCloud origin; the hook validates
// message origins against it and re-populates changed relations there.
const SERVER_URL = import.meta.env.VITE_SAHAJCLOUD_URL

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
    if (!allowedPreviewPaths(previewPath, collection).includes(pathname)) {
      navigate(previewPath, { replace: true })
    }
  }, [pathname, previewPath, collection, navigate])
}

// ── Event preview ────────────────────────────────────────────────────────────────

function EventLivePreview({ initialDoc }: { initialDoc: EventDoc }) {
  const queryClient = useQueryClient()
  const lastGood = useRef(initialDoc)

  const { data: liveDoc } = useLivePreview<EventDoc>({
    initialData: initialDoc,
    serverURL: SERVER_URL,
    depth: 1,
  })

  const previewPath = safePath(initialDoc.webPath) ?? `/${initialDoc.id}`

  // Live: merge each incoming doc onto the last good one (keeping collapsed relations),
  // re-shape, and inject into the drawer's cache. safeParse keeps the last good doc
  // when a mid-edit form state is transiently invalid. Runs on mount too (liveDoc
  // starts as initialDoc), seeding the cache before the route lock's boot hop lands.
  useEffect(() => {
    const parsed = EventDocSchema.safeParse(mergePreviewData(lastGood.current, liveDoc))

    if (!parsed.success) return

    lastGood.current = parsed.data
    queryClient.setQueryData(['event', parsed.data.id], shapeEventDoc(parsed.data))
  }, [liveDoc, queryClient])

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

function RegionLivePreview({ initialDoc }: { initialDoc: RegionDoc }) {
  const queryClient = useQueryClient()

  const { data: liveDoc } = useLivePreview<RegionDoc>({
    initialData: initialDoc,
    serverURL: SERVER_URL,
    depth: 1,
  })

  const { slug } = initialDoc
  const previewPath = safePath(initialDoc.webPath) ?? `/${slug}`

  // Live: regions have no drafts, so only editable scalars can change — overlay them
  // onto the cached shaped Region (counts/bounds/lists are geojson-derived and can't
  // move from a form edit). Skips until the region read has populated the cache.
  useEffect(() => {
    const cached = queryClient.getQueryData<Region>(['region', slug])

    if (!cached) return

    queryClient.setQueryData<Region>(['region', slug], {
      ...cached,
      name: liveDoc.name ?? cached.name,
      subtitle: liveDoc.subtitle,
      level: liveDoc.level,
    })
  }, [liveDoc, slug, queryClient])

  // The route lock performs the initial /preview -> region hop (the normal getRegion(slug)
  // then fills ['region', slug]) and pins it thereafter.
  usePreviewRouteLock(previewPath, 'regions')

  return null
}

function RegionPreview({ id }: { id: number }) {
  const { data: doc } = useSuspenseQuery({
    queryKey: ['preview-region-doc', id],
    queryFn: () => api.getRegionDocById(id),
  })

  return <RegionLivePreview initialDoc={doc} />
}

// A brand-new unsaved doc has no id (standard Payload limitation): show a hint instead
// of crashing on the fetch.
function PreviewFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 text-center">
      <p className="rounded-medium bg-background/90 px-4 py-3 text-sm text-gray-11 shadow-medium">
        Save this document to preview it.
      </p>
    </div>
  )
}

/**
 * Live-preview controller (issue #40). Mounted only in preview mode (lazy, from
 * AppShell), it renders no drawer of its own — it drives the drawer cache + map camera
 * from the live doc and inerts navigation. Dispatches on the previewed collection.
 */
export function PreviewController() {
  usePreviewLinkGuard()

  const id = preview.id ? Number(preview.id) : NaN

  if (!preview.id || Number.isNaN(id)) return <PreviewFallback />
  if (preview.collection === 'events') return <EventPreview id={id} />
  if (preview.collection === 'regions') return <RegionPreview id={id} />

  return <PreviewFallback />
}
