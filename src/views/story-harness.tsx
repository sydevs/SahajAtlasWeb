import type { ReactNode } from 'react'

import { Suspense, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'

import { ErrorFallback, LoadingFallback } from '@/components/molecules'
import { WidgetModeContext, type WidgetMode } from '@/config/mode'
import { NoopMapControllerProvider } from '@/hooks/use-map-controller'
import { mockGeojson } from '@/mocks/regions'

// Shared harness for the view stories (title group "Views"). A view is a
// data-connected drawer screen, so previewing one needs three things the Ladle
// decorator doesn't give it:
//
//  1. Seeded data. The view suspends on `useSuspenseQuery`; the harness seeds the
//     exact query keys into an ISOLATED client (staleTime/gcTime Infinity, no
//     retry) so the query resolves synchronously from cache and never touches the
//     absent backend. Bypassing the fetchers' zod parse is fine — TypeScript
//     guards the mock shapes.
//  2. The map-less contexts. Views read `useMapController` (the no-op provider,
//     since there's no Mapbox in a story) and `useWidgetMode`.
//  3. A bounded, scrollable box. Views render `DrawerHeader` + `DrawerBody`
//     directly (falling back to the default DrawerContext), so a flex column with
//     a fixed height stands in for the drawer panel.
//
// Keyed on `seedKey` (the control's use-case) so switching case remounts with a
// freshly seeded client.

export type ViewHarnessProps = {
  /** The active use-case key — remounts + re-seeds when it changes. */
  seedKey: string
  /** Populate the isolated query client with the case's mock data. */
  seed: (client: QueryClient) => void
  /** Widget mode; defaults to the map-less embed (`standalone`, no map). */
  mode?: WidgetMode
  children: ReactNode
}

export function ViewHarness({ seedKey, seed, mode, children }: ViewHarnessProps) {
  const client = useMemo(() => {
    const c = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } },
    })

    // Seed the feed + suppress the IP lookup for every view, so no story pings
    // the (absent) backend or the third-party geolocation service; the case's own
    // `seed` layers its view-specific keys on top.
    c.setQueryData(['geojson'], mockGeojson)
    c.setQueryData(['ip-location'], null)
    seed(c)

    return c
    // Re-seed only when the case changes; `seed` is a fresh closure each render.
  }, [seedKey])

  return (
    <div className="relative flex h-[640px] w-full max-w-[440px] flex-col overflow-hidden rounded-lg border border-divider bg-background">
      <QueryClientProvider client={client}>
        <WidgetModeContext.Provider value={mode ?? { standalone: true, hasMap: false }}>
          <NoopMapControllerProvider>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Suspense fallback={<LoadingFallback />}>
                {/* display:contents so the view's DrawerHeader/DrawerBody are the
                    box's own flex children (DrawerBody is flex-1 + scrolls). */}
                <div key={seedKey} className="contents">
                  {children}
                </div>
              </Suspense>
            </ErrorBoundary>
          </NoopMapControllerProvider>
        </WidgetModeContext.Provider>
      </QueryClientProvider>
    </div>
  )
}
