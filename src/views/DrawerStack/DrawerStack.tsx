import { type ReactNode, Suspense, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ErrorBoundary } from 'react-error-boundary'

import { Drawer } from '@/components/atoms/Drawer'
import { useBreakpoint } from '@/config/responsive'
import { useWidgetMode } from '@/config/mode'
import { type StackEntry, resolveStack } from '@/lib/shape'
import { DrawerErrorFallback, DrawerLoading } from '@/views/shared'
import { RootView } from '@/views/RootView/RootView'
import { SearchView } from '@/views/SearchView/SearchView'
import { RegionView } from '@/views/RegionView/RegionView'
import { EventView } from '@/views/EventView/EventView'
import { RegistrationView } from '@/views/RegistrationView/RegistrationView'
import { ShareView } from '@/views/ShareView/ShareView'

// The mobile RootView peek / half / full snap points.
const SNAP_POINTS = ['8rem', '0.5', '0.97']

// Render the view for one stack entry, threading the nested child drawer through.
function EntryView({
  entry,
  parentPath,
  isTop,
  children,
}: {
  entry: StackEntry
  parentPath: string
  isTop: boolean
  children?: ReactNode
}) {
  switch (entry.kind) {
    case 'search':
      return <SearchView isTop={isTop}>{children}</SearchView>
    case 'region':
      return (
        <RegionView isTop={isTop} parentPath={parentPath} slug={entry.slug}>
          {children}
        </RegionView>
      )
    case 'event':
      return (
        <EventView basePath={entry.path} id={entry.id} isTop={isTop} parentPath={parentPath}>
          {children}
        </EventView>
      )
    case 'register':
      return (
        <RegistrationView eventPath={entry.eventPath} isTop={isTop} parentPath={parentPath}>
          {children}
        </RegistrationView>
      )
    case 'share':
      return (
        <ShareView eventPath={entry.eventPath} isTop={isTop} parentPath={parentPath}>
          {children}
        </ShareView>
      )
  }
}

// The whole drawer navigation, derived purely from the pathname: RootView is the
// base, and `resolveStack` gives one drawer per ancestor. There is no drawer-stack
// store and no PUSH/POP interception — dismissing a drawer (swipe/Esc/back) is just
// `navigate(parentPath)`, so the router's history is the stack. Direction is left
// at ≥md, bottom on mobile; the wrapper remounts on the crossing (vaul `direction`
// is not hot-swappable) but content is route-driven so nothing is lost.
//
// With a map, RootView is the non-dismissable base drawer and every ancestor is a
// nested drawer over the map. Map-less, RootView renders inline (filling the widget
// container) and the ancestors are `contained` drawers portaled into that container.
export function DrawerStack() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isMd } = useBreakpoint('md')
  const { hasMap, standalone } = useWidgetMode()
  const direction = isMd ? 'left' : 'bottom'
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  const entries = resolveStack(location.pathname)

  // Build drawers deepest-first; each entry is the previous one's child. With a
  // map every entry is nested inside the RootView base drawer; map-less, the first
  // entry is a root drawer over the inline base and the rest nest inside it.
  const renderEntry = (index: number): ReactNode => {
    if (index >= entries.length) return null

    const entry = entries[index]
    const isTop = index === entries.length - 1
    const parentPath = index === 0 ? '/' : entries[index - 1].path

    return (
      <Drawer
        key={entry.path}
        open
        contained={!hasMap}
        container={hasMap ? undefined : container}
        direction={direction}
        nested={hasMap || index > 0}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) navigate(parentPath)
        }}
      >
        <Suspense fallback={<DrawerLoading ariaLabel="Loading" />}>
          <ErrorBoundary FallbackComponent={DrawerErrorFallback}>
            <EntryView entry={entry} isTop={isTop} parentPath={parentPath}>
              {renderEntry(index + 1)}
            </EntryView>
          </ErrorBoundary>
        </Suspense>
      </Drawer>
    )
  }

  const rootView = (
    <Suspense fallback={<DrawerLoading ariaLabel="Loading" />}>
      <ErrorBoundary FallbackComponent={DrawerErrorFallback}>
        <RootView isTop={entries.length === 0}>{renderEntry(0)}</RootView>
      </ErrorBoundary>
    </Suspense>
  )

  // Map-less: inline base fills the widget container; drawers portal into it.
  // Standalone owns the viewport (100dvh); embedded fills the host's slot (100%),
  // so we never assume viewport height inside a host container.
  if (!hasMap) {
    return (
      <div
        ref={setContainer}
        className="relative w-full overflow-hidden bg-background"
        style={{ height: standalone ? '100dvh' : '100%' }}
      >
        {rootView}
      </div>
    )
  }

  return (
    <Drawer
      key={direction}
      open
      direction={direction}
      dismissible={false}
      snapPoints={direction === 'bottom' ? SNAP_POINTS : undefined}
    >
      {rootView}
    </Drawer>
  )
}
