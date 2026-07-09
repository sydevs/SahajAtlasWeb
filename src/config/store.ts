import { create } from 'zustand'
import { Feature } from 'geojson'

// ===== VIEW STATE ===== //

type ViewState = {
  zoom: number
  latitude: number
  longitude: number
  selection?: { latitude: number; longitude: number; approximate: boolean } | null
  boundary?: Feature
}

type ViewAction = {
  setViewState: (viewState: ViewState) => void
  setSelection: (selection: ViewState['selection']) => void
  setBoundary: (bounds: ViewState['boundary']) => void
}

export const useViewState = create<ViewState & ViewAction>((set) => ({
  latitude: 0,
  longitude: 0,
  zoom: 0,
  selection: null,
  setViewState: (viewState) => set(() => ({ ...viewState })),
  setSelection: (selection: ViewState['selection']) => set(() => ({ selection })),
  setBoundary: (boundary: ViewState['boundary']) => set(() => ({ boundary })),
}))

// ===== SEARCH STATE ===== //

type SearchState = {
  onlineOnly: boolean
}

type SearchAction = {
  setOnlineOnly: (onlineOnly: boolean) => void
}

export const useSearchState = create<SearchState & SearchAction>((set) => ({
  onlineOnly: false,
  setOnlineOnly: (onlineOnly) => set(() => ({ onlineOnly })),
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
