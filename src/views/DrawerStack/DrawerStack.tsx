import { type CSSProperties, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from 'react-error-boundary'

import { Drawer } from '@/components/atoms/Drawer'
import { useIsDesktop } from '@/config/responsive'
import { useWidgetMode } from '@/config/mode'
import { overlayContainer } from '@/lib/overlay'
import { type StackEntry, resolveStack } from '@/lib/shape'
import { DrawerControlContext, DrawerErrorFallback, DrawerLoading } from '@/views/shared'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { SearchView } from '@/views/SearchView/SearchView'
import { RegionView } from '@/views/RegionView/RegionView'
import { EventView } from '@/views/EventView/EventView'
import { RegistrationView } from '@/views/RegistrationView/RegistrationView'
import { ShareView } from '@/views/ShareView/ShareView'

// Mobile bottom-sheet snap ladder (ascending; vaul reads a string as px, a number
// as a fraction of the sheet height):
//  - '96px'  peek — the handle + the search / title row
//  - '300px' lower third — title + a list row + a peek of the next
//  - 0.97    near-full
const SNAP_POINTS = ['96px', '300px', 0.97]
const PEEK_SNAP = '96px' // the collapsed peek
const OPEN_SNAP = '300px' // default, and what the peek expands to

// How far each stacked ancestor peeks out behind the active sheet.
const PEEK_MOBILE = 16 // px above the sheet's top edge
const PEEK_DESKTOP = 12 // px to the right of the left panel

type Direction = 'left' | 'bottom'

// Dispatch the active (top) view — the one real drawer's content. `isTop` is always
// true here (ancestors are peek panels, not rendered views), so the view always
// frames the map for its level.
function TopView({ entry, parentPath }: { entry: StackEntry | null; parentPath: string }) {
  if (!entry) return <CountriesView isTop />

  switch (entry.kind) {
    case 'search':
      return <SearchView isTop />
    case 'region':
      return <RegionView isTop slug={entry.slug} />
    case 'event':
      return <EventView isTop basePath={entry.path} id={entry.id} />
    case 'register':
      return <RegistrationView isTop eventPath={entry.eventPath} parentPath={parentPath} />
    case 'share':
      return <ShareView isTop eventPath={entry.eventPath} />
  }
}

// A simulated ancestor drawer: a semi-transparent panel stacked behind the active
// sheet so the stack reads as one set of fading cards over the map rather than two
// separate drawers. On mobile it sits `depth * PEEK` above the sheet's *live* top
// (mirrored onto `--sy-sheet-top` every frame by DrawerStack), so it tracks a drag
// with no lag. Clicking pops straight to that ancestor.
function PeekStrip({
  depth,
  direction,
  zIndex,
  opacity,
  label,
  onClick,
}: {
  depth: number
  direction: Direction
  zIndex: number
  opacity: number
  label: string
  onClick: () => void
}) {
  const style: CSSProperties = { position: 'fixed', zIndex, opacity }
  let className: string

  if (direction === 'left') {
    style.top = 0
    style.bottom = 0
    style.left = 0
    style.width = 'var(--sy-drawer-w, 22rem)'
    style.maxWidth = '90vw'
    style.transform = `translateX(${depth * PEEK_DESKTOP}px)`
    style.transition = 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)'
    className = 'rounded-r-2xl border-r border-divider bg-background'
  } else {
    style.left = 0
    style.right = 0
    style.height = '100dvh'
    style.top = `calc(var(--sy-sheet-top, 100dvh) - ${depth * PEEK_MOBILE}px)`
    className = 'rounded-t-2xl border-t border-divider bg-background'
  }

  return (
    <button
      aria-label={label}
      className={className}
      style={style}
      type="button"
      onClick={onClick}
    />
  )
}

// The whole drawer navigation, derived purely from the pathname. ONE real vaul
// drawer holds the active (top) view; its ancestors are simulated as semi-transparent
// peek panels behind it (issue #30 — simulate rather than nest, so parents can't be
// dismissed and their peek stays synced to the sheet). Every view is handled the same
// way: dismissing navigates to the parent, and the one view with no parent
// (CountriesView) collapses to its peek instead of closing — so the panel never fully
// dismisses and there's no reopen affordance. Direction is left at ≥md, bottom on
// mobile. Map-less, the single drawer fills the widget container.
export function DrawerStack() {
  const location = useLocation()
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const { hasMap, standalone } = useWidgetMode()
  const { t } = useTranslation('common')
  const direction: Direction = isDesktop ? 'left' : 'bottom'
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [snap, setSnap] = useState<number | string | null>(OPEN_SNAP)
  const stripsRef = useRef<HTMLDivElement>(null)

  const entries = useMemo(() => resolveStack(location.pathname), [location.pathname])
  const top = entries.at(-1) ?? null
  // Ancestor paths below the top view, root-first (empty at CountriesView).
  const parentPaths = useMemo(
    () => (entries.length === 0 ? [] : ['/', ...entries.slice(0, -1).map((e) => e.path)]),
    [entries],
  )
  const parentPath = parentPaths.at(-1)
  const canCollapse = hasMap && direction === 'bottom'

  // Mirror the active sheet's live top onto the peek strips every frame, so they
  // track a drag without waiting for the snap to settle (map + mobile only).
  useEffect(() => {
    if (!hasMap || direction !== 'bottom' || parentPaths.length === 0) return
    let raf = 0
    let last = Number.NaN
    const tick = () => {
      const sheet = document.querySelector<HTMLElement>('[data-vaul-drawer]')
      const el = stripsRef.current

      if (sheet && el) {
        const top = sheet.getBoundingClientRect().top

        if (top !== last) {
          last = top
          el.style.setProperty('--sy-sheet-top', `${top}px`)
        }
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(raf)
  }, [hasMap, direction, parentPaths.length])

  // Uniform for every view: dismissing pops to the parent; the one view with no
  // parent (CountriesView) collapses to the peek instead of closing.
  const handleOpenChange = (open: boolean) => {
    if (open) return
    if (parentPath) navigate(parentPath)
    else setSnap(PEEK_SNAP)
  }

  const control = useMemo(
    () => ({
      collapsed: snap === PEEK_SNAP,
      canCollapse,
      toggle: () => setSnap((s) => (s === PEEK_SNAP ? OPEN_SNAP : PEEK_SNAP)),
    }),
    [snap, canCollapse],
  )

  const topView = (
    <Suspense fallback={<DrawerLoading ariaLabel={t('loading')} />}>
      <ErrorBoundary FallbackComponent={DrawerErrorFallback} resetKeys={[location.pathname]}>
        <TopView entry={top} parentPath={parentPath ?? '/'} />
      </ErrorBoundary>
    </Suspense>
  )

  // Map-less: one contained drawer fills the widget container (no map to reveal, so
  // no peek strips or snap ladder). Standalone owns the viewport (100dvh); embedded
  // fills the host's slot (100%).
  if (!hasMap) {
    return (
      <DrawerControlContext.Provider value={control}>
        <div
          ref={setContainer}
          className="relative w-full overflow-hidden bg-background"
          style={{ height: standalone ? '100dvh' : '100%' }}
        >
          <Drawer
            key={direction}
            contained
            full
            open
            container={container}
            direction={direction}
            dismissible={parentPaths.length > 0}
            onOpenChange={handleOpenChange}
          >
            {topView}
          </Drawer>
        </div>
      </DrawerControlContext.Provider>
    )
  }

  // Map mode: stacked ancestor panels (portaled behind the drawer) + the single drawer.
  const target = overlayContainer()
  const strips =
    parentPaths.length > 0 ? (
      <div ref={stripsRef}>
        {parentPaths.map((path, i) => {
          const depth = parentPaths.length - i

          return (
            <PeekStrip
              key={path}
              depth={depth}
              direction={direction}
              label={t('back')}
              opacity={Math.max(0.15, 0.55 - (depth - 1) * 0.18)}
              zIndex={30 + i}
              onClick={() => navigate(path)}
            />
          )
        })}
      </div>
    ) : null

  return (
    <DrawerControlContext.Provider value={control}>
      {target && strips && createPortal(strips, target)}
      <Drawer
        key={direction}
        dismissible
        open
        activeSnapPoint={direction === 'bottom' ? snap : undefined}
        direction={direction}
        setActiveSnapPoint={direction === 'bottom' ? setSnap : undefined}
        snapPoints={direction === 'bottom' ? SNAP_POINTS : undefined}
        onOpenChange={handleOpenChange}
      >
        {topView}
      </Drawer>
    </DrawerControlContext.Provider>
  )
}
