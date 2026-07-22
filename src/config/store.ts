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

// Accessed imperatively (getState) from navigation handlers + the frame effect, not
// subscribed to in render — so writing a snapshot never re-renders the map.
export const useCameraHistory = create<CameraHistoryState>((set, get) => ({
  snapshots: {},
  save: (key, camera) => set((state) => ({ snapshots: { ...state.snapshots, [key]: camera } })),
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
