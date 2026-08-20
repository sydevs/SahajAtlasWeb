import type { ReactNode } from 'react'
import type { Client, IpLocation } from '@/types'

import { Suspense, useEffect, useMemo } from 'react'
import clsx from 'clsx'
import { useLocation, useNavigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'
import { MapProvider } from 'react-map-gl'

import { DrawerSlotsProvider } from '@/components/atoms/Drawer'
import { DrawerControlContext } from '@/views/shared'
import { DrawerErrorFallback, DrawerLoading } from '@/views/fallbacks'
import { WidgetModeContext, type WidgetMode } from '@/config/mode'
import { clientQuery, regionsQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import { Mapbox } from '@/components/organisms/Mapbox/Map'
import { NoopMapControllerProvider, RealMapControllerProvider } from '@/hooks/use-map-controller'
import { mockErrors, mockNotFound } from '@/mocks/errors'
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
  /**
   * Widget mode; defaults to the map-less embed (`standalone`, no map, linkable).
   * **Partial** so a story overrides only the axis it is about — spelling the whole shape to
   * vary one field silently pins the others, which is how a story once flipped `standalone`
   * by accident and changed what the screen it previewed actually rendered.
   */
  mode?: Partial<WidgetMode>
  /**
   * The pathname to render at. Needed by anything that reads the URL rather than props —
   * above all the not-found recovery ladder, which walks the ancestry to find somewhere
   * real to send the viewer. Without it every dead-link case would preview the floor rung
   * ("Browse all countries") and none would show what the app actually offers.
   */
  path?: string
  /**
   * Render the real Mapbox canvas behind the drawer, as map mode does.
   *
   * Off by default, which is right for a view story about the view — the map costs a token, a
   * WebGL context and live tiles, and a story previewing a list does not need one. Turn it on
   * where the map IS part of what is being reviewed.
   *
   * ⚠ It is not just a flag on `WidgetMode`. `hasMap: true` alone tells the tree a map exists
   * without rendering one and without a real `MapController`, which is a state the app never has
   * — views would call `frameRegion` into a no-op and the canvas would be missing. All three
   * move together here for that reason.
   *
   * Needs `VITE_MAPBOX_ACCESSTOKEN`; without one it falls back to the map-less arm rather than
   * rendering a broken canvas.
   */
  map?: boolean
  /**
   * What the harness sizes itself against: the viewport (default) or its container.
   *
   * ⚠ **`screen` is wrong inside anything that is not the viewport**, and the compact embed's
   * dialog is exactly that: it keeps a margin, so `h-screen` renders 32px taller than the box
   * clipping it and the bottom of the scroll area — scrollbar included — is cut off. It still
   * scrolls; it reads as though it does not, which is worse.
   *
   * This is the container-vs-viewport tension the dialog's margin introduces, in the one place
   * we own the arithmetic. Note vaul has the same exposure and we do NOT own that one: it
   * computes a snap-point sheet's travel from `window.innerHeight`, so a real bottom sheet
   * inside the dialog is off by the same margin.
   */
  height?: 'screen' | 'container'
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

/**
 * Every failure a view story can throw, keyed by the label its control shows. The values
 * are the REAL thrown fixtures, so a story exercises `classifyError` rather than asserting
 * a kind it was handed.
 */
export const STORY_ERRORS = {
  'Not found · place': mockNotFound.region,
  'Not found · event': mockNotFound.event,
  Offline: mockErrors.offline,
  Server: mockErrors.server,
  Config: mockErrors.config,
  Unknown: mockErrors.unknown,
} as const

export type StoryErrorKey = keyof typeof STORY_ERRORS

/** The control's "render the view normally" option. */
export const NO_ERROR = 'None'

/**
 * A list that came back legitimately empty. On the same axis as the failures because it
 * is the same screen — `FallbackPanel` on the `empty` row of the same policy table, and a
 * viewer facing it is in exactly the position a dead link leaves them in (issue #89).
 *
 * The one option that is DATA rather than a throw, so `ViewStory` renders the view as
 * normal and the story seeds an emptied version of whatever example is selected. That is
 * what makes it a real second axis: every example can be seen empty, where "Empty" as an
 * example was one fixed region nobody could vary.
 */
export const EMPTY = 'Empty'

export type StoryFallbackArg = StoryErrorKey | typeof NO_ERROR | typeof EMPTY

/**
 * The failures EVERY data-reading view can reach, because they come from the FETCH rather
 * than the route: a dropped connection, a 5xx, a rejected API key, and the catch-all. A
 * view adds its own not-found flavours (and `Empty`, where it has one) on top — those are
 * the ones its ROUTES and its DATA can produce, and they're the only part that differs.
 */
const FETCH_ERRORS = ['Offline', 'Server', 'Config', 'Unknown'] as const

/**
 * The `error` argType for a view story, as a SECOND axis beside its examples — so any
 * fallback can be seen against any example rather than the two sharing one control and
 * making most combinations unreachable (issue #89).
 *
 * Pass what this view can reach that the others can't: its not-found flavour(s), and
 * `EMPTY` if its list can come back empty. The fetch failures every view shares are
 * appended. A view whose routes can't 404 and whose body is a single panel (the root,
 * search, the calendar, an event) passes only what applies.
 *
 * A `select`, not a radio: with the shared failures appended this runs to seven options,
 * and a radio column that tall pushes the Example control off the panel.
 */
export const stateControl = (...viewFallbacks: (StoryErrorKey | typeof EMPTY)[]) => ({
  name: 'Fallback',
  options: [NO_ERROR, ...viewFallbacks, ...FETCH_ERRORS] as StoryFallbackArg[],
  control: { type: 'select' as const },
  defaultValue: NO_ERROR as StoryFallbackArg,
})

export type ViewStoryProps = Omit<ViewHarnessProps, 'seedKey'> & {
  /** The example's key — folded into the harness's seedKey with the state. */
  example: string
  /** The selected fallback state, or `NO_ERROR` / `EMPTY` to render the view. */
  state?: StoryFallbackArg
}

/**
 * `ViewHarness` with the fallback axis folded in: renders `children` normally, or throws
 * the selected fixture inside the drawer's boundary.
 *
 * `EMPTY` renders `children` too — nothing throws to produce an empty list, so the story
 * seeds it. The harness can't: which key to empty, and what "empty" means for that view,
 * is the story's own knowledge.
 *
 * Both axes go into `seedKey`, so switching either remounts with a freshly seeded client —
 * without that, flipping from a failure back to the view would re-render onto a client the
 * previous case left behind, and `EMPTY` would never re-seed at all.
 *
 * **`path` is what makes the failure fit the example.** The recovery ladder walks the URL's
 * ancestry, so a story that passes its example's own canonical path gets the rung a real
 * viewer would get — a city offers its parent region, a country has no ancestor and falls
 * through to the IP guess — with no per-fallback stub anywhere.
 */
export function ViewStory({ example, state = NO_ERROR, children, ...harness }: ViewStoryProps) {
  const thrown = state === NO_ERROR || state === EMPTY ? undefined : STORY_ERRORS[state]

  return (
    <ViewHarness {...harness} seedKey={`${example}·${state}`}>
      {thrown ? <Thrower error={thrown} /> : children}
    </ViewHarness>
  )
}

export function ViewHarness({
  seedKey,
  seed,
  mode,
  path,
  map,
  height = 'screen',
  children,
}: ViewHarnessProps) {
  // A token-less environment gets the map-less arm: a canvas that cannot load tiles previews
  // nothing and fills the console with Mapbox errors.
  const withMap = Boolean(map && import.meta.env.VITE_MAPBOX_ACCESSTOKEN)

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
      <WidgetModeContext.Provider
        value={{ standalone: true, hasMap: withMap, linkable: true, ...mode }}
      >
        <MapFrame enabled={withMap}>
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
              {/* With a map behind it the drawer is a PANEL, as it is in map mode; without one
                  it fills the canvas, as a map-less embed does. Both are positioned: the map
                  wrapper is `absolute`, and a positioned element paints above a static sibling
                  whatever the DOM order — so a static column sat *underneath* the canvas and the
                  view appeared to float transparently over the map. Measured, not guessed. */}
              <div
                key={seedKey}
                className={clsx(
                  'relative z-10 flex flex-col overflow-hidden bg-background text-foreground',
                  withMap
                    ? 'absolute inset-y-0 start-0 w-[22rem] max-w-full shadow-2xl'
                    : height === 'container'
                      ? 'h-full'
                      : 'h-screen',
                )}
              >
                <Suspense fallback={<DrawerLoading />}>
                  <ErrorBoundary FallbackComponent={DrawerErrorFallback}>
                    {path ? <SeedPath path={path}>{children}</SeedPath> : children}
                  </ErrorBoundary>
                </Suspense>
              </div>
            </DrawerSlotsProvider>
          </DrawerControlContext.Provider>
        </MapFrame>
      </WidgetModeContext.Provider>
    </QueryClientProvider>
  )
}

/**
 * The map layer, or nothing — the same shape `AppShell`'s `FullInterface` uses.
 *
 * Mirrors the app rather than approximating it: the canvas is `fixed; inset: 0` behind the
 * drawer, `MapProvider` is what `useMapbox` reads, and `RealMapControllerProvider` must render
 * inside it. Off, it is the same `NoopMapControllerProvider` every view story had before, so
 * nothing that does not ask for a map changes.
 */
function MapFrame({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return <NoopMapControllerProvider>{children}</NoopMapControllerProvider>

  return (
    <MapProvider>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Mapbox />
      </div>
      <RealMapControllerProvider>{children}</RealMapControllerProvider>
    </MapProvider>
  )
}
