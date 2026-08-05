import type { ReactNode } from 'react'
import type { Client, IpLocation } from '@/types'

import { Suspense, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'

import { DrawerSlotsProvider } from '@/components/atoms/Drawer'
import { DrawerControlContext, DrawerErrorFallback, DrawerLoading } from '@/views/shared'
import { WidgetModeContext, type WidgetMode } from '@/config/mode'
import { clientQuery, regionsQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import { NoopMapControllerProvider } from '@/hooks/use-map-controller'
import { mockGeojson, mockRegionNodes } from '@/mocks/regions'

// The comprehensive event-variant list, re-exported here so the event-list view
// stories (Region / Online / Search) build their lists from ONE shared source.
// `mockEventSeries` rides along for the paged cases, which need bulk over variety.
export { mockEventSeries, mockEventVariants } from '@/mocks/events'

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
//  4. The drawer's OWN fences. Suspense + ErrorBoundary in DrawerStack's nesting,
//     with the drawer-shaped fallbacks — the harness used to wrap stories in the
//     app-level ones, previewing a screen the drawer stack never renders (#89).
//
// Keyed on `seedKey` (the control's use-case) so switching case remounts with a
// freshly seeded client.

/** A minimal host-client record — CountriesView suspends on this (locale + home
 *  region bootstrap); no home region, so no canonical link is emitted. */
const mockClient: Client = { id: 1, name: 'Demo Host', locale: 'en', region: null }

/** A passive IP guess (Cambridge) so the nearby-suggestion prompt renders on the
 *  views that show it (Countries / Region / Search). Sits where the feed has a
 *  located class within reach, and far from the country/region the default example
 *  frames, so `shouldShowGeolocationPrompt` resolves true (a region you're already
 *  viewing locally correctly suppresses it). */
const mockIpLocation: IpLocation = {
  latitude: 52.2,
  longitude: 0.12,
  city: 'Cambridge',
  region: 'Cambridgeshire',
  country: 'United Kingdom',
  // A real guess carries the code, and two features read it: the share grid's
  // region ordering (`useViewerCountry`) and the `?cc` the accepted suggestion writes
  // — neither of which a code-less guess would exercise.
  country_code: 'GB',
}

/** A drawer control for stories: dismissable (so the fallbacks render their close
 *  control), but with nowhere to actually go. */
const STORY_DRAWER_CONTROL = {
  collapsed: false,
  canCollapse: false,
  canDismiss: true,
  toggle: () => {},
  dismiss: () => {},
}

export type ViewHarnessProps = {
  /** The active use-case key — remounts + re-seeds when it changes. */
  seedKey: string
  /** Populate the isolated query client with the case's mock data. Omit for a case that
   *  renders no view (an error case, which throws before any query is read). */
  seed?: (client: QueryClient) => void
  /** Widget mode; defaults to the map-less embed (`standalone`, no map). */
  mode?: WidgetMode
  /**
   * The pathname to render at. Needed by anything that reads the URL rather than props —
   * above all the not-found recovery ladder, which walks the ancestry to find somewhere
   * real to send the viewer. Without it every dead-link case would preview the floor rung
   * ("Browse all countries") and none would show what the app actually offers.
   */
  path?: string
  children: ReactNode
}

/**
 * Seeds the pathname onto the decorator's own MemoryRouter (nesting a second Router throws
 * in react-router v7), and holds `children` back until it lands.
 *
 * The gate is the point: `SeedSearchParams` accepts being one render late because a filter
 * pill appearing a frame later is invisible. Here the first render would resolve a
 * DIFFERENT recovery rung — "Browse all countries" — and the story would visibly flip to
 * "See events in Antwerpen", which is exactly the layout shift these previews exist to
 * catch rather than cause.
 */
function SeedPath({ path, children }: { path: string; children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.pathname !== path) navigate(path, { replace: true })
  }, [path, location.pathname, navigate])

  return location.pathname === path ? <>{children}</> : null
}

/**
 * Drive a story into its error state: render this as the harness's children and the
 * value is thrown inside the boundary, exactly as a failing view's query would throw it,
 * so DrawerErrorFallback classifies it for real.
 *
 * A thrower rather than a seeded rejection because the harness seeds its QueryClient
 * synchronously and React Query has no public API for seeding a REJECTED query. It's
 * passed as `children` rather than through a prop of its own so the harness keeps ONE
 * slot for "what renders inside the boundary".
 */
export function Thrower({ error }: { error: unknown }): never {
  throw error
}

export function ViewHarness({ seedKey, seed, mode, path, children }: ViewHarnessProps) {
  const client = useMemo(() => {
    const c = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } },
    })

    // Seed the feed, the wholesale region tree, the host-client record, and a passive
    // IP guess (so the nearby prompt renders where supported) for every view — no
    // story pings the (absent) backend or the third-party geolocation service; the
    // case's own `seed` layers its view-specific keys on top. The region tree is
    // read by anything filter-adjacent (the Region filter's options, the active-pill
    // name lookup, the country-website check), which is why it's global rather than
    // per-case.
    c.setQueryData(['geojson'], mockGeojson)
    c.setQueryData(regionsQuery().queryKey, mockRegionNodes)
    c.setQueryData(clientQuery(atlasAuth.apiKey).queryKey, mockClient)
    c.setQueryData(['ip-location'], mockIpLocation)
    seed?.(c)

    return c
    // Re-seed only when the case changes; `seed` is a fresh closure each render.
  }, [seedKey])

  return (
    <QueryClientProvider client={client}>
      <WidgetModeContext.Provider value={mode ?? { standalone: true, hasMap: false }}>
        <NoopMapControllerProvider>
          {/* A full-view drawer panel: fills the story canvas (the width-xsmall frame,
              which the global decorator renders un-padded for views) as a flex column so
              the view's DrawerHeader (shrink-0) and DrawerBody (flex-1, scrolls) lay out
              exactly as in the real sheet. The filled drawer context gives the
              header/body the SAME padding the map-less app renders (the `filled` mode's
              `pt-4`), so the story's top spacing matches the real drawer rather than the
              anchored default's `pt-2`.

              The slots wrap the boundary, not the other way round: DrawerErrorFallback
              and DrawerLoading render a DrawerBody, so they need the drawer context —
              and this is the nesting DrawerStack itself uses (DrawerContent > Suspense >
              ErrorBoundary > the view). */}
          {/* A live drawer control, so the chrome the fallbacks render is exercisable
              rather than inert: `canDismiss` decides whether they show a close button at
              all, and without a provider every story would preview the root's control set
              (issue #89). `dismiss` is a no-op — a story has nowhere to dismiss to. */}
          <DrawerControlContext.Provider value={STORY_DRAWER_CONTROL}>
            <DrawerSlotsProvider direction="bottom" mode="filled">
              <div
                key={seedKey}
                className="flex h-screen flex-col overflow-hidden bg-background text-foreground"
              >
                <Suspense fallback={<DrawerLoading />}>
                  {/* The DRAWER fallback, matching DrawerStack — the app-level
                      ErrorFallback previewed a screen the drawer stack never shows. */}
                  <ErrorBoundary FallbackComponent={DrawerErrorFallback}>
                    {path ? <SeedPath path={path}>{children}</SeedPath> : children}
                  </ErrorBoundary>
                </Suspense>
              </div>
            </DrawerSlotsProvider>
          </DrawerControlContext.Provider>
        </NoopMapControllerProvider>
      </WidgetModeContext.Provider>
    </QueryClientProvider>
  )
}
