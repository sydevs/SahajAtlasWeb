import type {
  FixIntent,
  ListingDraft,
  ListingSender,
  ListingStep,
  OpenedListing,
} from '@/lib/proposal'
import type { CalendarViewOption } from '@/lib/shape'

import { create } from 'zustand'
import { Feature } from 'geojson'

import { deepActiveElement } from '@/lib/active-element'

// ===== VIEW STATE ===== //

// This is a point the map emphasizes with a sprite.
// The committed `selection`, from `frameEvent`, and the transient `hover`, from `highlightEvent`, share this shape.
// `approximate` swaps the crisp pin for the softer area sprite, used for online events.
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
 * That module imports `react-map-gl`, which runs `import('mapbox-gl')` at module scope.
 * So the node lane cannot import that module, and a flag living there could not be tested at all.
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
   * A compact embed unmounts the whole interface when its dialog closes.
   * `CompactEmbedView` passes the interface as `children` and deliberately does not `forceMount` it.
   * A stale `true` value would then meet a freshly mounted map sitting at `[0, 0]`, zoom 0.
   * So the curtain would not draw, the world frame would paint, and the first framing would fly across the planet again.
   *
   * The map's own unmount calls this function.
   * "The camera has arrived" is a fact about a live map instance, and it must die with that instance.
   */
  forgetSettled: () => set((state) => (state.settled ? { settled: false } : state)),
}))

// ===== CALENDAR POSITION ===== //

// This holds the full-width `CalendarView`'s last view — one of the three the switch offers, never the `month-agenda` a width collapses onto — plus its focused date.
// The store keeps this so applying a filter, which remounts the filters-keyed grid, does not reset Schedule-X to today's month grid.
// Opening an event and coming back also does not reset it.
// This state is session-scoped and clears on reload.
// The grid SEEDS from this store once at mount, through `getState`.
// It then writes both fields imperatively as the user navigates.
// So a write never re-renders the calendar.
// `DrawerStack` also reads `view` reactively, through a selector, to size the drawer — the wide panel exists only above the width crossing, and the list view never takes it (#331).
// `date` is only ever read through `getState`, so its frequent writes stay render-free.
type CalendarPositionState = {
  view: CalendarViewOption | null
  date: string | null
  setView: (view: CalendarViewOption) => void
  setDate: (date: string) => void
}

export const useCalendarPosition = create<CalendarPositionState>((set) => ({
  view: null,
  date: null,
  setView: (view) => set(() => ({ view })),
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

// ===== RESULT FOLDS ===== //

// Which folded groups of a list are open. A store for the same reason as the reveal above: the
// drawer stack remounts views, and coming back from a class should find the group still open.
// `open` holds only what the visitor has toggled, so each group's own default still applies until
// then. A new `key` (a new place, an edited filter) starts again from those defaults.
type ResultFoldsState = {
  key: string
  open: Record<string, boolean>
  setOpen: (key: string, id: string, open: boolean) => void
}

export const useResultFolds = create<ResultFoldsState>((set) => ({
  key: '',
  open: {},
  setOpen: (key, id, open) =>
    set((state) => ({ key, open: { ...(state.key === key ? state.open : {}), [id]: open } })),
}))

// The filters a searched place first showed with, to tell one that came along from an earlier search
// from one the visitor chose here. Only the current place matters, so it holds one.
export const useArrivalFilters = create<{ place: string; filters: string }>(() => ({
  place: '',
  filters: '',
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

// ===== NEAR ME ===== //

// The point the Near me filter last searched from. Whether Near me is ON is this compared with
// the URL's `?center`, so it survives closing and reopening the form. It stays out of the URL on
// purpose: a shared link names a place, and only the visitor who pressed it is actually there.
type NearMeState = {
  center: [number, number] | null
  setCenter: (center: [number, number] | null) => void
}

export const useNearMeState = create<NearMeState>((set) => ({
  center: null,
  setCenter: (center) => set(() => ({ center })),
}))

// ===== FILTER PANEL ===== //

// The wide-container filter panel. `open` is what the visitor last chose, remembered, and open by
// default: `onScreen` is whether it's actually showing, which also depends on the view and the
// room, and is what the camera's padding reads.
const FILTER_PANEL_KEY = 'atlas.filtersPanel'

// Open by default on every visit: closing lasts for this visit only (sessionStorage), so the
// next visit starts with the filters showing again.
const readPanelOpen = (): boolean => {
  try {
    return sessionStorage.getItem(FILTER_PANEL_KEY) !== 'closed'
  } catch {
    return true
  }
}

type FilterPanelState = {
  open: boolean
  onScreen: boolean
  setOpen: (open: boolean) => void
  setOnScreen: (onScreen: boolean) => void
}

export const useFilterPanelState = create<FilterPanelState>((set) => ({
  open: typeof window === 'undefined' ? true : readPanelOpen(),
  onScreen: false,
  setOpen: (open) => {
    try {
      sessionStorage.setItem(FILTER_PANEL_KEY, open ? 'open' : 'closed')
    } catch {
      // Storage can throw in sandboxed iframes. The choice then lasts for this visit only.
    }
    set(() => ({ open }))
  },
  setOnScreen: (onScreen) => set(() => ({ onScreen })),
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

// ===== LISTING DRAFT ===== //

// The add-a-class and correction flows (#147): the listing and the step panel both read it, and
// it survives the md-crossing remount. `key` names the route (`add:/gb/london`, `correct:507`).
// A value, not an import: `lib/proposal` stays out of the eager graph this store is in.
export const EMPTY_SENDER: ListingSender = { email: '', note: '' }

type ListingDraftState = {
  key: string | null
  /** The history entry the session opened on: a remount keeps it, reopening the flow does not. */
  entry: string | null
  draft: ListingDraft | null
  /** What a correction opened as, so only what changed is sent. */
  base: ListingDraft | null
  sender: ListingSender
  step: ListingStep
  /** Whether review has been reached, after which a step returns straight to it. */
  reviewed: boolean
  /** What a correction set out to fix, once its first screen is answered. */
  intent: FixIntent | null
  /**
   * Whether the correction reports the class as stopped. Held apart from `intent`, which follows
   * the latest answer: "correct something else too" must not drop a report already made.
   */
  reported: boolean
  /** A report that someone went and found nobody: the day they went, or '' if not given. */
  nobodyOn: string | null
  /** Set once a submission resolves. Nothing reads the row back, so this is the whole receipt. */
  sent: boolean
}

type ListingDraftAction = {
  start: (session: { key: string; entry: string }, opened: OpenedListing) => void
  update: (patch: Partial<ListingDraft>) => void
  setSender: (patch: Partial<ListingSender>) => void
  setStep: (step: ListingStep) => void
  /** Answers a correction's "what needs fixing?" and opens the step that fixes it. */
  setIntent: (intent: FixIntent, step: ListingStep) => void
  /** Takes back a "stopped running" report, as a change on Check is undone. */
  clearReport: () => void
  setNobodyOn: (date: string | null) => void
  markSent: () => void
}

export const useListingDraft = create<ListingDraftState & ListingDraftAction>((set) => ({
  key: null,
  entry: null,
  draft: null,
  base: null,
  sender: EMPTY_SENDER,
  step: 'where',
  reviewed: false,
  intent: null,
  reported: false,
  nobodyOn: null,
  sent: false,
  start: ({ key, entry }, { draft, base, step }) =>
    set(() => ({
      key,
      entry,
      draft,
      base: base ?? null,
      sender: EMPTY_SENDER,
      step,
      reviewed: step === 'review',
      intent: null,
      reported: false,
      nobodyOn: null,
      sent: false,
    })),
  setSender: (patch) => set((state) => ({ sender: { ...state.sender, ...patch } })),
  update: (patch) => set((state) => (state.draft ? { draft: { ...state.draft, ...patch } } : {})),
  setStep: (step) => set((state) => ({ step, reviewed: state.reviewed || step === 'review' })),
  setIntent: (intent, step) =>
    set((state) => ({
      intent,
      step,
      reported: state.reported || intent === 'stopped',
      nobodyOn: intent === 'nobody' ? (state.nobodyOn ?? '') : state.nobodyOn,
    })),
  clearReport: () => set(() => ({ reported: false })),
  setNobodyOn: (nobodyOn) => set(() => ({ nobodyOn })),
  markSent: () => set(() => ({ sent: true })),
}))

type ClassSheetState = {
  /**
   * The height a class's, a place's list's or the filters' phone sheet opens at, or null when none
   * is on top on a phone (the camera then allows for the usual open sheet).
   */
  bottom: number | null
  setBottom: (bottom: number | null) => void
}

/**
 * The drawer measures this and the map camera reads it, so a class's pin, or the place a list or
 * the filters are about, clears its sheet.
 * Neither side renders the other's context, and the drawer must not import the map's hooks.
 */
export const useClassSheet = create<ClassSheetState>((set) => ({
  bottom: null,
  setBottom: (bottom) => set(() => ({ bottom })),
}))

type MapTapState = {
  /** How many taps have landed on open map (not on a pin or a cluster). */
  taps: number
  tap: () => void
  /**
   * How many times the map has opened a page at its own height: a class's pin, or a cluster that
   * won't split opening its list.
   */
  opens: number
  open: () => void
}

/**
 * The map reports a tap on open map, and the drawer lowers its phone sheet to the peek, so the
 * map the visitor reached for comes into view (Anton, 6 Nov). It also asks for the page it opens
 * (a class, or the list of a cluster that won't split) to open at its own height. The same seam
 * as `useClassSheet`: neither side renders the other's context.
 */
export const useMapTap = create<MapTapState>((set) => ({
  taps: 0,
  tap: () => set((state) => ({ taps: state.taps + 1 })),
  opens: 0,
  open: () => set((state) => ({ opens: state.opens + 1 })),
}))
