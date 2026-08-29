import { create } from 'zustand'
import { Feature } from 'geojson'

// ===== VIEW STATE ===== //

// A point the map emphasizes with a sprite: the committed `selection` (from
// frameEvent) and the transient `hover` (from highlightEvent) share this shape.
// `approximate` swaps the crisp pin for the softer area sprite (online events).
export type MapPoint = { latitude: number; longitude: number; approximate: boolean }

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

// Search filters no longer live here — they're the single source of truth in the
// URL query (`src/hooks/use-filters.ts` + `filtersToParams`/`filtersFromParams`),
// so a filtered view is linkable. The map + list read them with `useEventFilters`.

// ===== CAMERA HISTORY ===== //

// A remembered camera, keyed by `location.key`, so going *back* restores the exact
// viewport the user left instead of re-deriving it from the region/event. Captured
// at navigation time (via the Link atom + useAtlasNavigate, before any new framing
// runs — so it never races the incoming view's frame), read on a POP navigation by
// `useFrameOnTop`. `location.key` is stable per history entry, so browser
// back/forward hit the same snapshot for free.
export type CameraSnapshot = Pick<
  ViewState,
  'zoom' | 'latitude' | 'longitude' | 'selection' | 'boundary'
>

type CameraHistoryState = {
  snapshots: Record<string, CameraSnapshot>
  save: (key: string, camera: CameraSnapshot) => void
  read: (key: string) => CameraSnapshot | undefined
}

// Bound the history so a long-lived embedded session can't grow it without limit;
// far more than back/forward ever reaches back through. Oldest-inserted evicts first
// (object key order), which is fine — restores target recent entries.
const MAX_SNAPSHOTS = 50

// Accessed imperatively (getState) from navigation handlers + the frame effect, not
// subscribed to in render — so writing a snapshot never re-renders the map.
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

/**
 * Snapshot the live camera (from `useViewState`) under a history key. Called right
 * before an in-widget push so a later POP back to that entry can restore it.
 */
export const rememberCamera = (key: string): void => {
  const { zoom, latitude, longitude, selection, boundary } = useViewState.getState()

  useCameraHistory.getState().save(key, { zoom, latitude, longitude, selection, boundary })
}

// ===== CAMERA SETTLED ===== //

/**
 * Whether the camera has been commanded yet this session — i.e. whether the map has ARRIVED
 * anywhere, as opposed to still sitting on the boot-time world view.
 *
 * `<ReactMapGL>` is deliberately uncontrolled and takes no `initialViewState`, so it boots at
 * `[0, 0]` zoom 0 and the first framing has to carry it to wherever the visitor actually asked
 * for. Two things need to know that this is the first move, and it is the same fact both times:
 *
 *  - **the first camera command jumps rather than flies** (`use-mapbox.ts`). A `flyTo` from zoom
 *    0 to zoom 15 arcs across the whole planet, which on a deep link to a region or an event is
 *    a long, disorienting animation of somewhere the visitor never asked to see. Every LATER
 *    transition still flies — that symmetry between drilling in and backing out is deliberate.
 *  - **the map stays hidden until then** (`Map.tsx`), so the world frame is never painted.
 *
 * ⚠ **Not `isEntry`**, which is the obvious-looking alternative and is wrong. `isEntry` is
 * `atlasDepth(location) === 0`, true both for a fresh deep link AND for a structural climb — so
 * dismissing an event up to its region an hour into a session would jump, breaking the rule that
 * every in-app level transition flies one tuned arc. "Has the camera moved yet" is a fact about
 * the map, and it is exactly the condition under which a fly is disorienting.
 *
 * ⚠ **Here rather than beside `usePaddingState` in `use-mapbox.ts`**: that module imports
 * `react-map-gl`, which does `import('mapbox-gl')` at module scope, so the node lane cannot
 * import it and a flag living there could not be tested at all.
 */
type CameraSettled = {
  settled: boolean
  markSettled: () => void
  forgetSettled: () => void
}

export const useCameraSettled = create<CameraSettled>((set) => ({
  settled: false,
  // Idempotent by identity, not just by value: every camera command calls this, and a `set`
  // that returned a fresh object each time would notify subscribers — re-rendering the map on
  // every pan and zoom for a boolean that stopped changing after the first one.
  markSettled: () => set((state) => (state.settled ? state : { settled: true })),
  /**
   * Forget it, because the map this described has gone.
   *
   * ⚠ **Not housekeeping — without it both fixed defects come back on the second view.** This
   * store is module-global while the map is not: a compact embed unmounts the whole interface
   * when its dialog closes (`CompactEmbedView` passes the interface as `children` and
   * deliberately does not `forceMount` it). A stale `true` would then meet a freshly mounted map
   * sitting at [0, 0] zoom 0 — so the curtain would not draw, the world frame would be painted,
   * and the first framing would fly across the planet again.
   *
   * Called from the map's own unmount, because "the camera has arrived" is a fact about a live
   * map instance and has to die with it.
   */
  forgetSettled: () => set((state) => (state.settled ? { settled: false } : state)),
}))

// ===== CALENDAR POSITION ===== //

// The full-width CalendarView's last view (`month-grid` / `week` / `list`) + focused
// date, kept so applying a filter (which remounts the filters-keyed grid) or opening an
// event and coming back doesn't reset Schedule-X to the month grid on today. Session-scoped
// and cleared on reload. The grid SEEDS from it once at mount (via getState) and writes both
// fields imperatively as the user navigates — so a write never re-renders the calendar. The
// `view` is additionally read reactively (a selector) by DrawerStack to size the drawer
// (list view → regular width); `date` is only ever read via getState, so its frequent writes
// stay render-free.
type CalendarPositionState = {
  view: string | null
  date: string | null
  setView: (view: string) => void
  setDate: (date: string) => void
}

export const useCalendarPosition = create<CalendarPositionState>((set) => ({
  view: null,
  date: null,
  setView: (view) => set(() => ({ view })),
  setDate: (date) => set(() => ({ date })),
}))

// ===== RESULTS REVEAL ===== //

// How much of the search results list is revealed: the row count, and whether the
// distant (beyond the distance boundary) segment has been reached. Session-scoped and
// cleared on reload — a fresh visit starts at the first page, which is what a reload
// is asking for. A store rather than component state because the drawer stack REMOUNTS
// views: opening an event and coming back would otherwise drop the reader back to the
// top of a list they had paged deep into. Not in the URL either — paging is a reading
// position, not a destination, and it has no business in a shared link.
//
// `key` is the result set the counts describe (centre + filters + sort + locale). When
// the list reads a different key than the one stored, the reveal simply IS the first
// page — so a new search, a filter edit or a re-sort resets by construction, with no
// reset call to forget at any of the call sites that change those things.
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

// Open state for the report-issue modal (issue #79). Deliberately NOT part of the
// URL-driven drawer stack: the modal is ephemeral, never appears in the URL,
// `resolveStack` never sees it, and opening or closing it must neither push nor pop
// history. It's a store rather than local state because its three triggers live in
// unrelated subtrees — the settings cog, the app-level ErrorFallback, and the in-drawer
// DrawerErrorFallback — and the two error CTAs must reach a modal host mounted OUTSIDE
// the ErrorBoundary that is currently rendering them.
type ReportModalState = {
  open: boolean
  /** Whatever was thrown, when opened from an error CTA — carried into the report context. */
  error: string | null
  openReport: (error?: string | null) => void
  closeReport: () => void
}

// The control that opened the modal, so focus can return to it. Held outside the store's
// reactive state — it's a DOM node read once on close, and writing it must not re-render.
let reportOpener: HTMLElement | null = null

/** The element that opened the report modal, if it's still in the document. */
export const reportReturnFocus = (): HTMLElement | null =>
  reportOpener?.isConnected ? reportOpener : null

export const useReportModal = create<ReportModalState>((set) => ({
  open: false,
  error: null,
  openReport: (error) => {
    // Captured at CLICK time, not on open: the settings menu unmounts its item before the
    // dialog mounts, so by the time Radix records a "previously focused element" it would
    // be <body> — and closing would drop a keyboard user at the top of the host page.
    reportOpener =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    set(() => ({ open: true, error: error ?? null }))
  },
  // Clear the error too, so a later open from the settings menu can't inherit the
  // error context of an earlier, unrelated report.
  closeReport: () => set(() => ({ open: false, error: null })),
}))

// ===== REGISTRATION DRAFT ===== //

// In-progress registration form values, hoisted out of the form so a drawer
// remount (e.g. the md-crossing direction remount) can't drop a half-filled form.
// Scoped to one event at a time; cleared on submit or when a different event's
// form opens. Read/written via getState() in the form to avoid a watch↔store loop.
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
