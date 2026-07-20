import type { ReactNode } from 'react'
import type { Client, IpLocation } from '@/types'

import { Suspense, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'

import { DrawerSlotsProvider } from '@/components/atoms/Drawer'
import { ErrorFallback, LoadingFallback } from '@/components/molecules'
import { WidgetModeContext, type WidgetMode } from '@/config/mode'
import { clientQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import { NoopMapControllerProvider } from '@/hooks/use-map-controller'
import { mockGeojson } from '@/mocks/regions'

// The comprehensive event-variant list, re-exported here so the event-list view
// stories (Region / Online / Search) build their lists from ONE shared source.
export { mockEventVariants } from '@/mocks/events'

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
//  3. A full-height drawer panel. Views render `DrawerHeader` + `DrawerBody`
//     directly (falling back to the default DrawerContext), so the harness stands
//     in for the sheet with a flex column that fills the story canvas — a single,
//     full-view page, not a boxed card. Paired with the stories' `width: 'xsmall'`
//     default, this reads as the real drawer panel at phone width.
//
// Keyed on `seedKey` (the control's use-case) so switching case remounts with a
// freshly seeded client.

/** A minimal host-client record — CountriesView suspends on this (locale + home
 *  region bootstrap); no home region, so no canonical link is emitted. */
const mockClient: Client = { id: 1, name: 'Demo Host', locale: 'en', region: null }

/** A passive IP guess (Cambridge) so the nearby-suggestion prompt renders on the
 *  views that show it (Countries / Region / Search). Sits where the feed has a
 *  located class within reach, and far from the country/region the default example
 *  frames, so `shouldShowNearbyPrompt` resolves true (a region you're already
 *  viewing locally correctly suppresses it). */
const mockIpLocation: IpLocation = {
  latitude: 52.2,
  longitude: 0.12,
  city: 'Cambridge',
  region: 'Cambridgeshire',
  country: 'United Kingdom',
}

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

    // Seed the feed, the host-client record, and a passive IP guess (so the nearby
    // prompt renders where supported) for every view — no story pings the (absent)
    // backend or the third-party geolocation service; the case's own `seed` layers
    // its view-specific keys on top.
    c.setQueryData(['geojson'], mockGeojson)
    c.setQueryData(clientQuery(atlasAuth.apiKey).queryKey, mockClient)
    c.setQueryData(['ip-location'], mockIpLocation)
    seed(c)

    return c
    // Re-seed only when the case changes; `seed` is a fresh closure each render.
  }, [seedKey])

  return (
    <QueryClientProvider client={client}>
      <WidgetModeContext.Provider value={mode ?? { standalone: true, hasMap: false }}>
        <NoopMapControllerProvider>
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<LoadingFallback />}>
              {/* A full-view drawer panel: fills the story canvas (the width-xsmall
                  frame, which the global decorator renders un-padded for views) as a
                  flex column so the view's DrawerHeader (shrink-0) and DrawerBody
                  (flex-1, scrolls) lay out exactly as in the real sheet. The filled
                  drawer context gives the header/body the SAME padding the map-less
                  app renders (the `filled` mode's `pt-4`), so the story's top spacing
                  matches the real drawer rather than the anchored default's `pt-2`. */}
              <DrawerSlotsProvider direction="bottom" mode="filled">
                <div
                  key={seedKey}
                  className="flex h-screen flex-col overflow-hidden bg-background text-foreground"
                >
                  {children}
                </div>
              </DrawerSlotsProvider>
            </Suspense>
          </ErrorBoundary>
        </NoopMapControllerProvider>
      </WidgetModeContext.Provider>
    </QueryClientProvider>
  )
}
