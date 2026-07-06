import { type ReactNode, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ErrorBoundary } from 'react-error-boundary'

import { Drawer } from '@/components/atoms/Drawer'
import { useBreakpoint } from '@/config/responsive'
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
// non-dismissable base, and `resolveStack` gives one nested drawer per ancestor.
// There is no drawer-stack store and no PUSH/POP interception — dismissing a
// drawer (swipe/Esc/back) is just `navigate(parentPath)`, so the router's history
// is the stack. Direction is left at ≥md, bottom on mobile; the wrapper remounts
// on the crossing (vaul `direction` is not hot-swappable) but content is
// route-driven so nothing is lost.
export function DrawerStack() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isMd } = useBreakpoint('md')
  const direction = isMd ? 'left' : 'bottom'

  const entries = resolveStack(location.pathname)

  // Build nested drawers deepest-first; each entry is the previous one's child.
  const renderEntry = (index: number): ReactNode => {
    if (index >= entries.length) return null

    const entry = entries[index]
    const isTop = index === entries.length - 1
    const parentPath = index === 0 ? '/' : entries[index - 1].path

    return (
      <Drawer
        key={entry.path}
        nested
        open
        direction={direction}
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

  return (
    <Drawer
      key={direction}
      open
      direction={direction}
      dismissible={false}
      snapPoints={direction === 'bottom' ? SNAP_POINTS : undefined}
    >
      <Suspense fallback={<DrawerLoading ariaLabel="Loading" />}>
        <ErrorBoundary FallbackComponent={DrawerErrorFallback}>
          <RootView isTop={entries.length === 0}>{renderEntry(0)}</RootView>
        </ErrorBoundary>
      </Suspense>
    </Drawer>
  )
}
