import { type CSSProperties, Suspense, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from 'react-error-boundary'

import { Drawer } from '@/components/atoms/Drawer'
import { LocationIcon } from '@/components/atoms/Icons'
import { useIsDesktop } from '@/config/responsive'
import { useWidgetMode } from '@/config/mode'
import { overlayContainer } from '@/lib/overlay'
import { type StackEntry, resolveStack } from '@/lib/shape'
import { DrawerErrorFallback, DrawerLoading } from '@/views/shared'
import { RootView } from '@/views/RootView/RootView'
import { SearchView } from '@/views/SearchView/SearchView'
import { RegionView } from '@/views/RegionView/RegionView'
import { EventView } from '@/views/EventView/EventView'
import { RegistrationView } from '@/views/RegistrationView/RegistrationView'
import { ShareView } from '@/views/ShareView/ShareView'

// The mobile bottom-sheet snap ladder (ascending; vaul reads a string as px and a
// number as a fraction of the sheet height):
//  - '96px'  small peek — just the handle + title/close row above the fold
//  - '300px' lower third on most phones — title + one list row + a peek of the next
//  - 0.97    near-full coverage
const SNAP_POINTS = ['96px', '300px', 0.97]
const DEFAULT_SNAP = '300px'

// How far each stacked parent peeks out behind the active sheet.
const PEEK_MOBILE = 14 // px above the sheet's top edge
const PEEK_DESKTOP = 10 // px to the right of the left panel

type Direction = 'left' | 'bottom'

// The active (top) view — the one real drawer's content. `isTop` is always true
// here (ancestors are peek strips, not rendered views), so the view always frames
// the map for its level.
function TopView({ entry, parentPath }: { entry: StackEntry | null; parentPath: string }) {
  if (!entry) return <RootView isTop />

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

// A simulated parent drawer: a static card behind the active sheet, offset by depth
// so a sliver peeks out — above it on mobile, beside it on desktop — and tracking
// the sheet's snap position (the transform re-eases when `snap` changes). Clicking
// it pops the stack straight to that ancestor.
function PeekStrip({
  depth,
  direction,
  snap,
  zIndex,
  label,
  onClick,
}: {
  depth: number
  direction: Direction
  snap: number | string | null
  zIndex: number
  label: string
  onClick: () => void
}) {
  const style: CSSProperties = {
    position: 'fixed',
    zIndex,
    transition: 'transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)',
  }
  let className: string

  if (direction === 'left') {
    style.top = 0
    style.bottom = 0
    style.left = 0
    style.width = 'var(--sy-drawer-w, 22rem)'
    style.maxWidth = '90vw'
    style.transform = `translateX(${depth * PEEK_DESKTOP}px)`
    className = 'rounded-r-2xl border-r border-divider bg-background shadow-2xl'
  } else {
    const peek = depth * PEEK_MOBILE
    const ty =
      typeof snap === 'number'
        ? `calc(${((1 - snap) * 100).toFixed(2)}dvh - ${peek}px)`
        : `calc(100dvh - ${parseInt(String(snap), 10) || 0}px - ${peek}px)`

    style.left = 0
    style.right = 0
    style.top = 0
    style.height = '100dvh'
    style.transform = `translateY(${ty})`
    className = 'rounded-t-2xl border-t border-divider bg-background shadow-2xl'
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

// The floating control that reopens the panel after the base view is dismissed
// (map mode only — map-less has nothing behind to reveal).
function ReopenButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-divider bg-background px-4 py-3 text-foreground shadow-2xl transition-colors hover:bg-primary-2"
      type="button"
      onClick={onClick}
    >
      <LocationIcon size={20} />
      <span className="text-sm font-semibold">{label}</span>
    </button>
  )
}

// The whole drawer navigation, derived purely from the pathname. ONE real vaul
// drawer holds the active (top) view; its ancestors are simulated as static peek
// strips behind it (see issue #30 — we simulate parents rather than nest real
// drawers, so parents can't be dismissed and their peek stays synced to the sheet's
// snap). Dismissing a child pops one level (navigate to the parent); dismissing the
// base collapses to the floating reopen button. Direction is left at ≥md, bottom on
// mobile; the drawer remounts on the crossing (vaul `direction` isn't hot-swappable)
// but content is route-driven so nothing is lost. Map-less, the single drawer fills
// the widget container (no map to reveal → no peek/snap/collapse).
export function DrawerStack() {
  const location = useLocation()
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const { hasMap, standalone } = useWidgetMode()
  const { t } = useTranslation('common')
  const direction: Direction = isDesktop ? 'left' : 'bottom'
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [snap, setSnap] = useState<number | string | null>(DEFAULT_SNAP)

  const entries = useMemo(() => resolveStack(location.pathname), [location.pathname])
  const top = entries.at(-1) ?? null
  const atRoot = entries.length === 0
  // Ancestor paths below the top view, root-first (empty at the root itself).
  const parentPaths = useMemo(
    () => (entries.length === 0 ? [] : ['/', ...entries.slice(0, -1).map((e) => e.path)]),
    [entries],
  )
  const parentPath = parentPaths.at(-1) ?? '/'

  // Any navigation re-opens a collapsed panel (e.g. selecting an event from the map).
  useEffect(() => setDismissed(false), [location.pathname])

  const handleOpenChange = (open: boolean) => {
    if (open) return
    if (!atRoot) navigate(parentPath)
    else if (hasMap) setDismissed(true)
  }

  const topView = (
    <Suspense fallback={<DrawerLoading ariaLabel={t('loading')} />}>
      <ErrorBoundary FallbackComponent={DrawerErrorFallback} resetKeys={[location.pathname]}>
        <TopView entry={top} parentPath={parentPath} />
      </ErrorBoundary>
    </Suspense>
  )

  // Map-less: one contained drawer fills the widget container. Standalone owns the
  // viewport (100dvh); embedded fills the host's slot (100%).
  if (!hasMap) {
    return (
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
          dismissible={!atRoot}
          onOpenChange={handleOpenChange}
        >
          {topView}
        </Drawer>
      </div>
    )
  }

  // Map mode: peek strips (portaled behind the drawer) + the single drawer + the
  // reopen FAB when the base is collapsed.
  const target = overlayContainer()
  const strips =
    !dismissed && parentPaths.length > 0
      ? parentPaths.map((path, i) => (
          <PeekStrip
            key={path}
            depth={parentPaths.length - i}
            direction={direction}
            label={t('back')}
            snap={snap}
            zIndex={30 + i}
            onClick={() => navigate(path)}
          />
        ))
      : null

  return (
    <>
      {target && strips && createPortal(strips, target)}
      <Drawer
        key={direction}
        dismissible
        activeSnapPoint={direction === 'bottom' ? snap : undefined}
        direction={direction}
        open={!dismissed}
        setActiveSnapPoint={direction === 'bottom' ? setSnap : undefined}
        snapPoints={direction === 'bottom' ? SNAP_POINTS : undefined}
        onOpenChange={handleOpenChange}
      >
        {topView}
      </Drawer>
      {target &&
        dismissed &&
        createPortal(
          <ReopenButton label={t('explore')} onClick={() => setDismissed(false)} />,
          target,
        )}
    </>
  )
}
