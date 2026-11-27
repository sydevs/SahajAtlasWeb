import type { ReactNode } from 'react'
import type { Client } from '@/types'

import { Suspense, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useLocation, useNavigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLadleContext } from '@ladle/react'
import { ErrorBoundary } from 'react-error-boundary'

import { DrawerSlotsProvider } from '@/components/atoms/Drawer'
import { SettingsMenu } from '@/components/molecules/SettingsMenu'
import { DrawerControlContext, NO_DRAWER_CONTROL } from '@/views/shared'
import { DrawerErrorFallback, DrawerLoading } from '@/views/fallbacks'
import { WidgetModeContext, type WidgetMode } from '@/config/mode'
import { clientQuery, geojsonQuery, regionsQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import { WidgetWidthContext, useIsWide } from '@/config/responsive'
import { useApproxLocation, useCalendarPosition } from '@/config/store'
import { calendarFillsWidth } from '@/lib/shape/calendar'
import { setFrame } from '@/lib/overlay'
import { usePublishedNode } from '@/hooks/use-published-node'
import { mockErrors, mockNotFound } from '@/mocks/errors'
import { parentOf } from '@/lib/shape'
import { mockApproxLocation, mockGeojson, mockRegionNodes } from '@/mocks/regions'
import { MapLayer, MapProviders } from '@/views/FullInterface'
import { InlineColumns, PlaceHeading } from '@/views/InlineEmbedView/InlineEmbedView'
import { VIEW_CONTROLS } from '@/views/story-controls'

// The comprehensive event-variant list, re-exported here so the event-list view
// stories (Region / Online / Search) build their lists from ONE shared source.
// `mockEventSeries` rides along for the paged cases, which need bulk over variety.
export { mockEventSeries, mockEventVariants } from '@/mocks/events'

// A shared harness for the view stories (title group "Views"). A view is a
// data-connected drawer screen, so previewing one needs four things the Ladle
// decorator does not give it:
//
//  1. Seeded data. The view suspends on `useSuspenseQuery`. The harness seeds the
//     exact query keys into an ISOLATED client (staleTime/gcTime Infinity, no
//     retry), so the query resolves synchronously from cache and never touches the
//     absent backend. Bypassing the fetchers' zod parse is fine — TypeScript
//     guards the mock shapes.
//  2. The map, and the contexts around it. The global Map control puts a real canvas
//     and `MapController` behind the view, or the no-op seam a `map=false` embed has,
//     and `useWidgetMode` agrees with whichever it is.
//  3. The surface the view renders in, in the form the global Form control picks: the
//     inline embed's page, or the expanded map's frame. Views render `DrawerHeader` and
//     `DrawerBody` directly, so the harness stands in for the drawer with the slots
//     that form uses.
//  4. The drawer's OWN fences. Suspense plus ErrorBoundary in DrawerStack's
//     nesting, with the drawer-shaped fallbacks — the harness used to wrap stories
//     in the app-level ones, previewing a screen the drawer stack never renders
//     (#89).
//
// Keyed on `seedKey` (the control's use case), so switching case remounts with a
// freshly seeded client.

/** A minimal host-client record — CountriesView suspends on this (theme plus home
 *  region bootstrap). With no home region, it emits no canonical link. */
const mockClient: Client = { id: 1, title: 'Demo Host', region: null }

/** A drawer control for stories: Back names the story's parent page, but goes nowhere. */
const storyDrawerControl = (path: string | undefined) => ({
  ...NO_DRAWER_CONTROL,
  backTo: path ? (parentOf(path) ?? '/') : '/gb',
})

export type ViewHarnessProps = {
  /** The active use-case key — remounts and re-seeds when it changes. */
  seedKey: string
  /** Populates the isolated query client with the case's mock data. Omit for a case
   *  that renders no view (an error case, which throws before any query is read). */
  seed?: (client: QueryClient) => void
  /**
   * Widget mode. Defaults to what the Form control shows: an embed inline (not `standalone`),
   * the standalone page expanded, linkable either way.
   * **Partial**, so a story overrides only the axis it is about — spelling the whole shape
   * to vary one field silently pins the others, which is how a story once flipped
   * `standalone` by accident and changed what the screen it previewed actually rendered.
   *
   * ⚠ `hasMap` is the Map control's alone. On its own it would tell the tree a map exists
   * without drawing one or giving it a real `MapController`, a state the app never has.
   */
  mode?: Partial<Omit<WidgetMode, 'hasMap'>>
  /**
   * The pathname to render at. Needed by anything that reads the URL rather than props —
   * above all the not-found recovery ladder, which walks the ancestry to find somewhere
   * real to send the viewer. Without it every dead-link case would preview the floor rung
   * ("Browse all countries"), and none would show what the app actually offers.
   */
  path?: string
  /**
   * The view is the full-width calendar surface: over a wide map, outside its list view, it fills
   * the frame less a margin instead of taking the side panel, as `DrawerStack` sizes it.
   */
  wide?: boolean
  /** The expanded map's panel whatever the Form control says, for a story about the sheet. */
  expanded?: boolean
  children: ReactNode
}

/**
 * Seeds the pathname onto the decorator's own MemoryRouter (nesting a second Router
 * throws in react-router), and holds `children` back until it lands.
 *
 * The gate is the point: `SeedSearchParams` accepts being one render late, because a
 * filter pill appearing a frame later is invisible. Here the first render would resolve
 * a DIFFERENT recovery rung — "Browse all countries" — and the story would visibly flip
 * to "See events in Antwerpen", which is exactly the layout shift these previews exist
 * to catch, rather than cause.
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
 * Drives a story into its error state: render this as the harness's children, and the
 * value is thrown inside the boundary, exactly as a failing view's query would throw
 * it, so DrawerErrorFallback classifies it for real.
 *
 * This is a thrower rather than a seeded rejection, because the harness seeds its
 * QueryClient synchronously, and React Query has no public API for seeding a REJECTED
 * query. It is passed as `children`, rather than through a prop of its own, so the
 * harness keeps ONE slot for "what renders inside the boundary".
 */
export function Thrower({ error }: { error: unknown }): never {
  throw error
}

/**
 * Every failure a view story can throw, keyed by the label its control shows. The
 * values are the REAL thrown fixtures, so a story exercises `classifyError`, rather
 * than asserting a kind it was handed.
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
 * A list that came back legitimately empty. This sits on the same axis as the
 * failures, because it is the same screen — `FallbackPanel` on the `empty` row of the
 * same policy table — and a viewer facing it is in exactly the position a dead link
 * leaves them in (issue #89).
 *
 * This is the one option that is DATA rather than a throw, so `ViewStory` renders the
 * view as normal and the story seeds an emptied version of whatever example is
 * selected. That is what makes it a real second axis: every example can be seen empty,
 * where "Empty" as an example used to be one fixed region nobody could vary.
 */
export const EMPTY = 'Empty'

/**
 * `EMPTY` with filters applied: the list came back empty because of them, so the panel's way
 * out is "Clear all" rather than somewhere else to look. Data too, like `EMPTY` — the story
 * seeds the filters and the emptied list together.
 */
export const EMPTY_FILTERED = 'Empty · filtered'

/**
 * The view still waiting on its data: the drawer's Suspense fallback, the chrome a view keeps
 * while it loads. Every view reaches it, so it sits beside "render normally" on every story.
 */
export const LOADING = 'Loading'

export type StoryFallbackArg =
  StoryErrorKey | typeof NO_ERROR | typeof EMPTY | typeof EMPTY_FILTERED | typeof LOADING

/**
 * Suspends for good, so the drawer's loading chrome stays on screen. Only from an update after
 * mount: `SeedPath` reaches its path through a router navigation, which React renders as a
 * transition, and a transition that suspends keeps the screen it had — blank — rather than
 * showing the fallback.
 */
const NEVER = new Promise<never>(() => {})

function Suspender() {
  const [suspended, setSuspended] = useState(false)

  useEffect(() => setSuspended(true), [])

  if (suspended) throw NEVER

  return null
}

/**
 * The failures EVERY data-reading view can reach, because they come from the FETCH,
 * rather than the route: a dropped connection, a 5xx, a rejected API key, and the
 * catch-all. A view adds its own not-found flavours (and `Empty`, where it has one) on
 * top — those are the ones its ROUTES and its DATA can produce, and they are the only
 * part that differs.
 */
const FETCH_ERRORS = ['Offline', 'Server', 'Config', 'Unknown'] as const

/**
 * The `error` argType for a view story, as a SECOND axis beside its examples — so any
 * fallback can be seen against any example, rather than the two sharing one control and
 * making most combinations unreachable (issue #89).
 *
 * Pass what this view can reach that the others cannot: its not-found flavour(s), and
 * `EMPTY` if its list can come back empty. This appends the fetch failures every view
 * shares. A view whose routes cannot 404, and whose body is a single panel (the root,
 * search, the calendar, an event), passes only what applies.
 *
 * This is a `select`, not a radio: with the shared failures appended it runs to seven
 * options, and a radio column that tall pushes the Example control off the panel.
 */
export const stateControl = (
  ...viewFallbacks: (StoryErrorKey | typeof EMPTY | typeof EMPTY_FILTERED)[]
) => ({
  name: 'Fallback',
  options: [NO_ERROR, LOADING, ...viewFallbacks, ...FETCH_ERRORS] as StoryFallbackArg[],
  control: { type: 'select' as const },
  defaultValue: NO_ERROR as StoryFallbackArg,
})

export type ViewStoryProps = Omit<ViewHarnessProps, 'seedKey'> & {
  /** The example's key — folded into the harness's seedKey with the state. */
  example: string
  /** The selected fallback state, or `NO_ERROR` / `EMPTY` / `EMPTY_FILTERED` to render the view. */
  state?: StoryFallbackArg
}

/**
 * `ViewHarness` with the fallback axis folded in: renders `children` normally, or
 * throws the selected fixture inside the drawer's boundary.
 *
 * `EMPTY` renders `children` too — nothing throws to produce an empty list, so the
 * story seeds it. The harness cannot do this itself: which key to empty, and what
 * "empty" means for that view, is the story's own knowledge.
 *
 * Both axes go into `seedKey`, so switching either remounts with a freshly seeded
 * client — without that, flipping from a failure back to the view would re-render onto
 * a client the previous case left behind, and `EMPTY` would never re-seed at all.
 *
 * **`path` is what makes the failure fit the example.** The recovery ladder walks the
 * URL's ancestry, so a story that passes its example's own canonical path gets the
 * rung a real viewer would get — a city offers its parent region, a country has no
 * ancestor and falls through to the IP guess — with no per-fallback stub anywhere.
 */
export function ViewStory({ example, state = NO_ERROR, children, ...harness }: ViewStoryProps) {
  const thrown =
    state === NO_ERROR || state === EMPTY || state === EMPTY_FILTERED || state === LOADING
      ? undefined
      : STORY_ERRORS[state]

  return (
    <ViewHarness {...harness} seedKey={`${example}·${state}`}>
      {state === LOADING ? <Suspender /> : thrown ? <Thrower error={thrown} /> : children}
    </ViewHarness>
  )
}

/** Each control's value, or its default until the decorator has added it. */
function useViewControls() {
  const { control } = useLadleContext().globalState

  return {
    inline: (control.form?.value ?? VIEW_CONTROLS.form.defaultValue) === 'Inline',
    map: (control.map?.value ?? VIEW_CONTROLS.map.defaultValue) === true,
  }
}

export function ViewHarness({
  seedKey,
  seed,
  mode,
  path,
  wide = false,
  expanded = false,
  children,
}: ViewHarnessProps) {
  const controls = useViewControls()
  // A token-less environment gets the map-less arm: a canvas that cannot load tiles
  // previews nothing and fills the console with Mapbox errors.
  const withMap = controls.map && Boolean(import.meta.env.VITE_MAPBOX_ACCESSTOKEN)
  // A map-less atlas is always inline, as `App` renders it: there is no map to expand.
  const inline = (controls.inline && !expanded) || !withMap

  const client = useMemo(() => {
    const c = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } },
    })

    // Seeds the feed, the wholesale region tree, the host-client record, and a
    // approximate location (so the nearby prompt renders where supported) for every
    // view — no story pings the (absent) backend. The case's own `seed` layers its view-specific keys on top. The
    // region tree is read by anything filter-adjacent (the Region filter's
    // options, the active-pill name lookup, the country-website check), which is
    // why it is global rather than per-case.
    c.setQueryData(geojsonQuery().queryKey, mockGeojson)
    c.setQueryData(regionsQuery().queryKey, mockRegionNodes)
    c.setQueryData(clientQuery(atlasAuth.apiKey).queryKey, mockClient)
    useApproxLocation.setState({ location: mockApproxLocation })
    seed?.(c)

    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seeds only when the case changes: `seed` is a fresh closure each render
  }, [seedKey])

  // Keyed on the case, so switching it remounts the view, which re-frames the map, while the
  // map itself stays. DrawerStack's nesting: the slots sit outside the boundary, since
  // DrawerErrorFallback and DrawerLoading render a DrawerBody and need the drawer context.
  const view = (
    <Suspense key={seedKey} fallback={<DrawerLoading />}>
      <ErrorBoundary FallbackComponent={DrawerErrorFallback}>
        {path ? <SeedPath path={path}>{children}</SeedPath> : children}
      </ErrorBoundary>
    </Suspense>
  )

  return (
    <QueryClientProvider client={client}>
      <WidgetModeContext.Provider
        // Inline is an embed, so not standalone: "Expand map" is a button, not a new tab.
        value={{ standalone: !inline, hasMap: withMap, linkable: true, ...mode }}
      >
        {/* A live drawer control, so the chrome the fallbacks render is exercisable,
            rather than inert: `backTo` decides whether they show Back at
            all, and without a provider every story would preview the root's control
            set (issue #89). `dismiss` is a no-op — a story has nowhere to dismiss to. */}
        <DrawerControlContext.Provider value={storyDrawerControl(path)}>
          <MapProviders inline={inline}>
            {inline ? (
              <InlineForm>{view}</InlineForm>
            ) : (
              <ExpandedForm wide={wide}>{view}</ExpandedForm>
            )}
          </MapProviders>
        </DrawerControlContext.Provider>
      </WidgetModeContext.Provider>
    </QueryClientProvider>
  )
}

/**
 * The inline embed's page around one view: its heading, and the real `InlineColumns` with the
 * map box beside the view, or the one column a map-less embed has. The view renders in the
 * `inline` drawer slots, measured as `DrawerStack`'s inline arm measures its column, so its
 * title gives way to the heading where it names a place. "Expand map" is inert here: the Form
 * control is the way to the expanded form.
 */
function InlineForm({ children }: { children: ReactNode }) {
  const [column, setColumn] = useState<HTMLDivElement | null>(null)
  const isWide = useIsWide(column)

  return (
    <div className="@container flex min-h-screen w-full flex-col gap-2 bg-background py-4 text-foreground">
      <div className="flex items-center gap-3 px-4">
        <PlaceHeading />
        <SettingsMenu className="ms-auto -me-1.5 pointer-coarse:-me-3" variant="ghost" />
      </div>
      <InlineColumns map={<MapLayer settings={false} />}>
        <WidgetWidthContext.Provider value={isWide}>
          <div ref={setColumn} className="flex flex-col">
            <DrawerSlotsProvider mode="inline">{children}</DrawerSlotsProvider>
          </div>
        </WidgetWidthContext.Provider>
      </InlineColumns>
    </div>
  )
}

/**
 * The expanded map's frame around one view: the canvas filling it, and the view's panel over it.
 * The panel takes the shape `DrawerStack` gives it at the frame's width — the side panel where it
 * is wide, a bottom sheet where it is not, the calendar's full-width surface. The frame takes the
 * containing block with `contain: layout`, as the expanded dialog does, so the fixed canvas fills
 * it rather than the window.
 *
 * The header and body take the side panel's slots whatever the shape: no vaul root sits around
 * them here to give a sheet its handle, and the sheet's header leaves the handle its room.
 */
function ExpandedForm({ wide, children }: { wide: boolean; children: ReactNode }) {
  // Published as the widget's frame, as the dialog is, so the camera's padding measures the
  // panel this frame's width gives it, and a view's own dialogs portal into the frame.
  const { node: frame, adopt } = usePublishedNode<HTMLDivElement>(setFrame)
  const isWide = useIsWide(frame)
  const calendarView = useCalendarPosition((s) => s.view)
  const fullWidth = wide && calendarFillsWidth(isWide, calendarView)

  return (
    <div ref={adopt} className="relative h-screen overflow-clip [contain:layout]" data-sy-frame="">
      {frame && <MapLayer />}
      {frame && (
        <WidgetWidthContext.Provider value={isWide}>
          <DrawerSlotsProvider direction="left">
            <div
              className={clsx(
                // ⚠ Every shape is `absolute`, and only this line positions the panel: a
                // positioned panel paints above the canvas whatever the DOM order, and a second
                // position class from a branch once won the cascade (`relative` is emitted
                // after `absolute`) and let the column grow past its frame. Clip, never hidden
                // — this hand-copies the panel's own chrome, so `overflow-hidden` would
                // preview #326.
                'absolute z-10 flex flex-col overflow-clip border-divider bg-background text-foreground shadow-2xl',
                // The sheet is at its open snap, which the camera's padding assumes until a real
                // sheet reports its height.
                fullWidth
                  ? 'inset-4 rounded-2xl border'
                  : isWide
                    ? 'inset-y-0 start-0 w-[var(--sy-drawer-w,384px)] max-w-full border-e'
                    : 'inset-x-0 bottom-0 h-[300px] max-h-[calc(100%-160px)] rounded-t-2xl border-t',
              )}
            >
              {children}
            </div>
          </DrawerSlotsProvider>
        </WidgetWidthContext.Provider>
      )}
    </div>
  )
}
