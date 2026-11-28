import type { ApproxLocation } from '@/lib/approx-location'
import type { Feature } from 'geojson'

import { create } from 'zustand'

import { deepActiveElement } from '@/lib/active-element'
import {
  markGeolocationDismissed,
  parseApproxLocation,
  readGeolocationDismissed,
} from '@/lib/approx-location'

// ===== VIEW STATE ===== //

// This is a point the map emphasizes with a sprite.
// The committed `selection`, from `frameEvent`, and the transient `hover`, from `highlightEvent`, share this shape.
// `approximate` swaps the crisp pin for the softer area sprite. It covers both listings with no
// real place to draw: an online one, which has none at all, and a `vague` one, whose point is its
// town's centre. The map's own feature property for the second is `vague`, not this field.
export type MapPoint = {
  latitude: number
  longitude: number
  approximate: boolean
  /** An in-person listing with no real place: a pin zoomed out, its area zoomed in (#15). */
  vague?: boolean
}

type ViewState = {
  zoom: number
  latitude: number
  longitude: number
  selection?: MapPoint | null
  hover?: MapPoint | null
  boundary?: Feature
}

type ViewAction = {
  setViewState: (viewState: ViewState) => void
  setSelection: (selection: ViewState['selection']) => void
  setHover: (hover: ViewState['hover']) => void
  setBoundary: (bounds: ViewState['boundary']) => void
}

export const useViewState = create<ViewState & ViewAction>((set) => ({
  latitude: 0,
  longitude: 0,
  zoom: 0,
  selection: null,
  hover: null,
  setViewState: (viewState) => set(() => ({ ...viewState })),
  setSelection: (selection: ViewState['selection']) => set(() => ({ selection })),
  setHover: (hover: ViewState['hover']) => set(() => ({ hover })),
  setBoundary: (boundary: ViewState['boundary']) => set(() => ({ boundary })),
}))

// Search filters no longer live here.
// The URL query is their single source of truth now, through `src/hooks/use-filters.ts`, `filtersToParams`, and `filtersFromParams`.
// So a filtered view stays linkable.
// The map and the list both read the filters with `useEventFilters`.

// ===== CAMERA HISTORY ===== //

// This is a remembered camera, keyed by `location.key`.
// So going back restores the exact viewport the user left, instead of re-deriving it from the region or event.
// The app captures it at navigation time, through the `Link` atom and `useAtlasNavigate`, before any new framing runs.
// So it never races the incoming view's frame.
// `useFrameOnTop` reads it on a POP navigation.
// `location.key` stays stable per history entry, so browser back and forward hit the same snapshot for free.
export type CameraSnapshot = Pick<
  ViewState,
  'zoom' | 'latitude' | 'longitude' | 'selection' | 'boundary'
>

type CameraHistoryState = {
  snapshots: Record<string, CameraSnapshot>
  save: (key: string, camera: CameraSnapshot) => void
  read: (key: string) => CameraSnapshot | undefined
}

// This bounds the history, so a long-lived embedded session cannot grow it without limit.
// The limit is far more than back and forward ever reach through.
// The oldest-inserted entry evicts first, by object key order.
// This is fine, since a restore always targets a recent entry.
const MAX_SNAPSHOTS = 50

// Navigation handlers and the frame effect access this store imperatively, through `getState`.
// No render subscribes to it.
// So writing a snapshot never re-renders the map.
export const useCameraHistory = create<CameraHistoryState>((set, get) => ({
  snapshots: {},
  save: (key, camera) =>
    set((state) => {
      const snapshots = { ...state.snapshots, [key]: camera }
      const keys = Object.keys(snapshots)

      if (keys.length > MAX_SNAPSHOTS) delete snapshots[keys[0]]

      return { snapshots }
    }),
  read: (key) => get().snapshots[key],
}))

type CameraTarget = Pick<CameraSnapshot, 'zoom' | 'latitude' | 'longitude'>

/**
 * Where a camera move in flight will end, or `null` when the map is at rest.
 *
 * `useViewState` mirrors the camera only when the map STOPS moving. So during a fly it still
 * holds the place the fly left. Someone who clicks during the fly-back from a class, a
 * natural thing to do, would have that old place remembered as the camera of the screen
 * they are on. Going back later flies them there, with the list saying somewhere else.
 * Non-reactive, like the history itself: nothing renders from it.
 */
export const useCameraTarget = create<{ target: CameraTarget | null }>(() => ({ target: null }))

/**
 * This snapshots the camera, from `useViewState`, under a history key: the destination of a
 * fly in flight if there is one, because that is the place this screen is showing.
 * The app calls it right before an in-widget push.
 * So a later POP back to that entry can restore the camera.
 */
export const rememberCamera = (key: string): void => {
  const { zoom, latitude, longitude, selection, boundary } = useViewState.getState()
  const camera = useCameraTarget.getState().target ?? { zoom, latitude, longitude }

  useCameraHistory.getState().save(key, { ...camera, selection, boundary })
}

// ===== CAMERA SETTLED ===== //

/**
 * This tracks whether the camera has been commanded yet this session.
 * In other words, has the map ARRIVED anywhere, or is it still sitting on the boot-time world view?
 *
 * `<ReactMapGL>` is deliberately uncontrolled. It takes no `initialViewState`.
 * So it boots at `[0, 0]`, zoom 0, and the first framing must carry it to wherever the visitor actually asked for.
 * Two things need to know that this is the first move, and both need the same fact:
 *
 *  - **The first camera command jumps rather than flies** (`use-mapbox.ts`). A `flyTo` from zoom 0 to zoom 15
 *    arcs across the whole planet. On a deep link to a region or an event, that arc is a long, disorienting
 *    animation of somewhere the visitor never asked to see. Every LATER transition still flies.
 *    That symmetry between drilling in and backing out is deliberate.
 *  - **The map stays hidden until then** (`Map.tsx`), so the world frame is never painted.
 *
 * ⚠ **This is not `isEntry`.** `isEntry` looks like the obvious choice, but it is wrong.
 * `isEntry` is `atlasDepth(location) === 0`. That is true both for a fresh deep link and for a structural climb.
 * So dismissing an event up to its region an hour into a session would jump, breaking the rule that every
 * in-app level transition flies one tuned arc.
 * "Has the camera moved yet" is a fact about the map, and it is exactly the condition under which a fly is disorienting.
 *
 * ⚠ **This flag lives here, not beside `usePaddingState` in `use-mapbox.ts`.**
 * That module imports react-map-gl and this one is eager, so an eager reader of the flag there would put react-map-gl in every embed's payload (`use-map-controller.tsx`).
 */
type CameraSettled = {
  settled: boolean
  markSettled: () => void
  forgetSettled: () => void
}

export const useCameraSettled = create<CameraSettled>((set) => ({
  settled: false,
  // This is idempotent by identity, not only by value.
  // Every camera command calls this function.
  // A `set` call that returned a fresh object each time would notify subscribers.
  // That would re-render the map on every pan and zoom, for a boolean that stopped changing after the first call.
  markSettled: () => set((state) => (state.settled ? state : { settled: true })),
  /**
   * This clears the settled flag, because the map it described has gone.
   *
   * ⚠ **This is not housekeeping. Without it, both fixed defects come back on the second view.**
   * This store is module-global, but the map is not.
   * The inline embed swaps its own map for the expanded one, and back, without a reload.
   * A stale `true` value would then meet a freshly mounted map sitting at `[0, 0]`, zoom 0.
   * So the curtain would not draw, the world frame would paint, and the first framing would fly across the planet again.
   *
   * The map's own unmount calls this function.
   * "The camera has arrived" is a fact about a live map instance, and it must die with that instance.
   */
  forgetSettled: () => set((state) => (state.settled ? { settled: false } : state)),
}))

// ===== CALENDAR POSITION ===== //

// This holds the day the calendar's Month has in view: its month, and on a phone the day whose
// classes it lists. The store keeps it so applying a filter or opening a class and coming back
// does not reset the Month to today. The view itself lives in the URL (`?view=week`), with the
// Week's dates. This state is session-scoped and clears on reload.
type CalendarPositionState = {
  date: string | null
  setDate: (date: string) => void
}

export const useCalendarPosition = create<CalendarPositionState>((set) => ({
  date: null,
  setDate: (date) => set(() => ({ date })),
}))

// ===== RESULTS REVEAL ===== //

// This holds how much of the search results list is revealed.
// It holds the row count, and whether the distant segment, beyond the distance boundary, has been reached.
// This state is session-scoped and clears on reload.
// A fresh visit starts at the first page, which is what a reload is asking for.
// This is a store, not component state, because the drawer stack REMOUNTS views.
// Opening an event and coming back would otherwise drop the reader back to the top of a list they had paged deep into.
// This state does not live in the URL either.
// Paging is a reading position, not a destination, so it has no place in a shared link.
//
// `key` names the result set the counts describe: center, filters, sort, and locale.
// When the list reads a different key than the one stored, the reveal simply IS the first page.
// So a new search, a filter edit, or a re-sort resets the reveal by construction.
// No call site that changes those things needs to call a reset.
type ResultsRevealState = {
  key: string
  shown: number
  showAll: boolean
  revealMore: (key: string, next: { shown: number; showAll: boolean }) => void
}

export const useResultsReveal = create<ResultsRevealState>((set) => ({
  key: '',
  shown: 0,
  showAll: false,
  revealMore: (key, next) => set(() => ({ key, shown: next.shown, showAll: next.showAll })),
}))

// ===== REPORT MODAL ===== //

// This holds the open state for the report-issue modal, issue #79.
// This modal is deliberately NOT part of the URL-driven drawer stack.
// The modal is ephemeral. It never appears in the URL. `resolveStack` never sees it.
// Opening or closing it must neither push nor pop history.
// This is a store, not local state, because its three triggers live in unrelated subtrees.
// Those triggers are the settings cog, the app-level `ErrorFallback`, and the in-drawer `DrawerErrorFallback`.
// The two error CTAs must reach a modal host mounted OUTSIDE the ErrorBoundary that is currently rendering them.
type ReportModalState = {
  open: boolean
  /** This carries whatever was thrown, when an error CTA opens the modal, into the report context. */
  error: string | null
  openReport: (error?: string | null) => void
  closeReport: () => void
}

// This holds the control that opened the modal, so focus can return to it.
// This value stays outside the store's reactive state.
// It is a DOM node, read once on close, and writing it must not trigger a render.
let reportOpener: HTMLElement | null = null

/** This returns the element that opened the report modal, if it is still in the document. */
export const reportReturnFocus = (): HTMLElement | null =>
  reportOpener?.isConnected ? reportOpener : null

export const useReportModal = create<ReportModalState>((set) => ({
  open: false,
  error: null,
  openReport: (error) => {
    // This captures the element at CLICK time, not at open time.
    // The settings menu unmounts its item before the dialog mounts.
    // So by the time Radix records a "previously focused element," that element would be `<body>`.
    // Closing the modal would then drop a keyboard user at the top of the host page.
    const active = deepActiveElement()

    reportOpener = active instanceof HTMLElement ? active : null

    set(() => ({ open: true, error: error ?? null }))
  },
  // This also clears the error.
  // So a later open from the settings menu cannot inherit the error context of an earlier, unrelated report.
  closeReport: () => set(() => ({ open: false, error: null })),
}))

// ===== APPROXIMATE LOCATION ===== //

// Where the visitor roughly is: the default export of `/geo.js` (`lib/approx-location.ts`), or
// `null` without one, set once before the first render. A store so the visitor's own answer can
// join it (`dismissed`), and so a story can set one.
//
// `dismissed` is the visitor's X on the guessed town, kept for the browser session: the town is
// not offered again, and the country list stops putting their country first.
type ApproxLocationState = {
  location: ApproxLocation | null
  dismissed: boolean
  dismiss: () => void
}

export const useApproxLocation = create<ApproxLocationState>((set) => ({
  location: null,
  dismissed: readGeolocationDismissed(),
  dismiss: () => {
    markGeolocationDismissed()
    set({ dismissed: true })
  },
}))

/** Takes the location from `/geo.js`'s default export, read before the first render. */
export const bootApproxLocation = (geo: unknown): void =>
  useApproxLocation.setState({ location: parseApproxLocation(geo) })

// ===== NEAR ME ===== //

// The point the Near me filter last searched from. Near me is ON while the URL's `?center` is this
// point. It stays out of the URL on purpose: a shared link names a place, and only the visitor who
// pressed Near me is actually there.
type NearMeState = {
  center: [number, number] | null
  setCenter: (center: [number, number] | null) => void
}

export const useNearMeState = create<NearMeState>((set) => ({
  center: null,
  setCenter: (center) => set(() => ({ center })),
}))

// ===== SEARCH FOCUS ===== //

// A one-shot request for the list's place search to take focus when it next mounts. "Search
// instead", offered when Near me cannot locate the visitor, closes the filters onto the list,
// whose search box is not rendered until the drawer has gone.
type SearchFocusState = {
  requested: boolean
  request: () => void
  /** True once, for the first search box to mount after a request. */
  consume: () => boolean
}

export const useSearchFocus = create<SearchFocusState>((set, get) => ({
  requested: false,
  request: () => set(() => ({ requested: true })),
  consume: () => {
    const requested = get().requested

    if (requested) set(() => ({ requested: false }))

    return requested
  },
}))

// ===== REGISTRATION DRAFT ===== //

// This holds in-progress registration form values, hoisted out of the form.
// So a drawer remount, such as the md-crossing direction remount, cannot drop a half-filled form.
// This state is scoped to one event at a time.
// It clears on submit, or when a different event's form opens.
// The form reads and writes this through `getState()`, to avoid a loop between watching and writing the store.
type RegistrationDraftState = {
  eventId: number | null
  values: Record<string, unknown>
}

type RegistrationDraftAction = {
  setDraft: (eventId: number, values: Record<string, unknown>) => void
  clearDraft: () => void
}

export const useRegistrationDraft = create<RegistrationDraftState & RegistrationDraftAction>(
  (set) => ({
    eventId: null,
    values: {},
    setDraft: (eventId, values) => set(() => ({ eventId, values })),
    clearDraft: () => set(() => ({ eventId: null, values: {} })),
  }),
)

type SheetCoverState = {
  /** What the phone sheet covers of the map, in px, or null where there is no bottom sheet. */
  bottom: number | null
  setBottom: (bottom: number | null) => void
}

/**
 * The drawer resolves its active snap to this and the map camera reads it, so a framed pin clears
 * the sheet at whatever height the sheet is actually at.
 * Neither side renders the other's context, and the drawer must not import the map's hooks.
 */
export const useSheetCover = create<SheetCoverState>((set) => ({
  bottom: null,
  setBottom: (bottom) => set(() => ({ bottom })),
}))

type MapControlsState = {
  /** True where something over the map leaves its control column no clean place to show. */
  hidden: boolean
  setHidden: (hidden: boolean) => void
  /**
   * True while the filter buttons show beside the column: the panel sits beside the map, and
   * neither the full-width calendar nor the filters' own drawer is on top. Find-me steps aside
   * then, since their Where menu's Near me asks the same question.
   */
  filterMenus: boolean
  setFilterMenus: (shown: boolean) => void
}

/**
 * Hides the map's whole control column (`Mapbox/MapControls`): find-me, settings and the credits.
 * Whatever covers the map decides, and the column draws itself; like `useSheetCover`, neither side
 * renders the other's context.
 */
export const useMapControls = create<MapControlsState>((set) => ({
  hidden: false,
  setHidden: (hidden) => set(() => ({ hidden })),
  filterMenus: false,
  setFilterMenus: (filterMenus) => set(() => ({ filterMenus })),
}))

type BrowsedCountryState = {
  /** ISO alpha-2 of the last country page shown, or undefined after the world view. */
  code: string | undefined
  setCode: (code: string | undefined) => void
}

/**
 * The country the visitor was last looking at, for the place search's country scope. Search is a
 * route of its own (`/search`), so by the time its field is on screen the URL no longer names the
 * country page it was opened from. `DrawerStack` records it, since it sees every route.
 *
 * Not the URL, and not `?cc`, though both carry a country. The URL holds what a link must
 * reproduce for whoever opens it, and where the reader came from is not that: a shared `/search`
 * link would pin the recipient's suggestions to a country they never browsed. `?cc` answers a
 * different question — the country of the place that WAS searched, written once a place is
 * picked — and it is already ahead of this one in `MapSearch`'s fallback chain.
 */
export const useBrowsedCountry = create<BrowsedCountryState>((set) => ({
  code: undefined,
  setCode: (code) => set(() => ({ code })),
}))
