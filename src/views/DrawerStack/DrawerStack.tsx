import { type CSSProperties, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from 'react-error-boundary'
import { AnimatePresence, motion } from 'framer-motion'

import { Drawer, DrawerContent } from '@/components/atoms/Drawer'
import { SettingsMenu } from '@/components/molecules'
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
const PEEK_MOBILE = 5 // px above the sheet's top edge
const PEEK_DESKTOP = 6 // px to the right of the left panel

type Direction = 'left' | 'bottom'

// Dispatch the active (top) view's inner content. Only the top view is rendered
// (ancestors are peek panels, not rendered views), so each view frames the map for
// its level on mount.
function TopView({ entry, parentPath }: { entry: StackEntry | null; parentPath: string }) {
  if (!entry) return <CountriesView />

  switch (entry.kind) {
    case 'search':
      return <SearchView />
    case 'region':
      return <RegionView slug={entry.slug} />
    case 'event':
      return <EventView basePath={entry.path} id={entry.id} />
    case 'register':
      return <RegistrationView eventPath={entry.eventPath} parentPath={parentPath} />
    case 'share':
      return <ShareView eventPath={entry.eventPath} />
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
  const isLeft = direction === 'left'
  const style: CSSProperties = { position: 'fixed', zIndex }
  let className: string

  if (isLeft) {
    // Match the drawer atom's left variant: flush + square on tablet, floating +
    // rounded at ≥lg — geometry lives in these classes, not inline styles.
    className =
      'inset-y-0 left-0 w-[var(--sy-drawer-w,22rem)] max-w-[calc(100vw-2rem)] rounded-none border border-divider bg-background shadow-xl lg:inset-y-4 lg:left-4 lg:rounded-2xl'
  } else {
    style.left = 0
    style.right = 0
    style.height = '100dvh'
    // `top` tracks the sheet's live position (rAF); the depth offset is the animated
    // transform below, so drag-tracking stays instant while the stack eases.
    style.top = 'var(--sy-sheet-top, 100dvh)'
    className = 'rounded-t-2xl border-t border-divider bg-background shadow-xl'
  }

  // The stack slides out to make room as it grows (and back in as it shrinks): each
  // panel eases from flush with the sheet edge (offset 0) out to `depth * PEEK`, so
  // a newly-stacked panel enters from under the sheet while the existing panels shift
  // further out — and the reverse on close.
  const offset = isLeft ? { x: depth * PEEK_DESKTOP } : { y: -depth * PEEK_MOBILE }
  const flush = isLeft ? { x: 0 } : { y: 0 }

  return (
    <motion.button
      animate={{ ...offset, opacity }}
      aria-label={label}
      className={className}
      exit={{ ...flush, opacity: 0 }}
      initial={{ ...flush, opacity: 0 }}
      style={style}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      type="button"
      onClick={onClick}
    />
  )
}

// The whole drawer navigation, derived purely from the pathname. ONE persistent vaul
// drawer holds the active (top) view; its ancestors are simulated as semi-transparent
// peek panels behind it. Because the sheet is rendered once (DrawerStack owns the
// DrawerContent; views are just inner content), navigating never remounts/re-slides
// the drawer — the inner content cross-fades instead. Every view is handled the same
// way: dismissing navigates to the parent, and the one view with no parent
// (CountriesView) collapses to its peek instead of closing. Direction is left at ≥md,
// bottom on mobile. Map-less, the single drawer fills the widget container.
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
    // Look the sheet up lazily (it mounts with this effect) and cache it — no need to
    // re-query the DOM every frame; the effect re-runs (resetting this) if direction flips.
    let sheet: HTMLElement | null = null
    const tick = () => {
      sheet ??= document.querySelector<HTMLElement>('[data-vaul-drawer]')
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
  // parent (CountriesView) collapses to the peek instead of closing. Wired to both
  // the close/list buttons (via context) and vaul's swipe (onOpenChange).
  const control = useMemo(
    () => ({
      collapsed: snap === PEEK_SNAP,
      canCollapse,
      toggle: () => setSnap((s) => (s === PEEK_SNAP ? OPEN_SNAP : PEEK_SNAP)),
      dismiss: () => (parentPath ? navigate(parentPath) : setSnap(PEEK_SNAP)),
    }),
    [snap, canCollapse, parentPath, navigate],
  )

  const sheet = (
    <DrawerContent ariaLabel={t('free_meditation_classes')}>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={location.pathname}
          animate={{ opacity: 1 }}
          className="flex min-h-0 flex-1 flex-col"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <Suspense fallback={<DrawerLoading />}>
            <ErrorBoundary FallbackComponent={DrawerErrorFallback}>
              <TopView entry={top} parentPath={parentPath ?? '/'} />
            </ErrorBoundary>
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </DrawerContent>
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
            onOpenChange={(o) => !o && control.dismiss()}
          >
            {sheet}
          </Drawer>
          <SettingsMenu className="absolute bottom-3 right-3 z-40" />
        </div>
      </DrawerControlContext.Provider>
    )
  }

  // Map mode: stacked ancestor panels (portaled behind the drawer) + the single drawer.
  const target = overlayContainer()
  // Always render the container + AnimatePresence (even at 0 ancestors) so a removed
  // strip animates out on the way back to the root instead of vanishing.
  const strips = (
    <div ref={stripsRef}>
      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  )

  return (
    <DrawerControlContext.Provider value={control}>
      {target &&
        createPortal(
          <>
            {strips}
            <SettingsMenu className="fixed right-3 top-16 z-40" />
          </>,
          target,
        )}
      <Drawer
        key={direction}
        dismissible
        open
        activeSnapPoint={direction === 'bottom' ? snap : undefined}
        direction={direction}
        setActiveSnapPoint={direction === 'bottom' ? setSnap : undefined}
        snapPoints={direction === 'bottom' ? SNAP_POINTS : undefined}
        onOpenChange={(o) => !o && control.dismiss()}
      >
        {sheet}
      </Drawer>
    </DrawerControlContext.Provider>
  )
}
