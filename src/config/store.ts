import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { Feature } from 'geojson'

import {
  DEFAULT_FILTERS,
  type EventCadence,
  type EventFilters,
  type EventFormat,
} from '@/lib/shape'

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

// The event filters (format / time-of-day / days-of-week / languages / cadence).
// The single source of truth for what the events list and the map show; both
// apply the shared `matchesFilters` predicate. Read with a `useShallow` selector
// so the map (hot path) only re-renders on the fields it uses. Day/language
// arrays are kept sorted so their identity — and the list's query key — stay
// stable across no-op reorders.
type SearchState = EventFilters

type SearchAction = {
  setFormat: (format: EventFormat) => void
  setCadence: (cadence: EventCadence) => void
  setTimeOfDay: (timeOfDay: [number, number]) => void
  setDaysOfWeek: (daysOfWeek: number[]) => void
  toggleLanguage: (code: string) => void
  setLanguages: (languages: string[]) => void
  clearFilters: () => void
}

export const useSearchState = create<SearchState & SearchAction>((set) => ({
  ...DEFAULT_FILTERS,
  setFormat: (format) => set({ format }),
  setCadence: (cadence) => set({ cadence }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  setDaysOfWeek: (daysOfWeek) => set({ daysOfWeek: [...daysOfWeek].sort((a, b) => a - b) }),
  toggleLanguage: (code) =>
    set((state) => ({
      languages: state.languages.includes(code)
        ? state.languages.filter((existing) => existing !== code)
        : [...state.languages, code].sort(),
    })),
  setLanguages: (languages) => set({ languages: [...languages].sort() }),
  clearFilters: () => set(DEFAULT_FILTERS),
}))

// The filter-value slice (no setters) — the single read the events list and the
// map both consume, so the useShallow selector lives in one place. useShallow
// keeps the returned identity stable, so the map's hot path only re-renders when a
// filter field actually changes.
const pickFilters = (state: SearchState & SearchAction): EventFilters => ({
  format: state.format,
  timeOfDay: state.timeOfDay,
  daysOfWeek: state.daysOfWeek,
  languages: state.languages,
  cadence: state.cadence,
})

export const useEventFilters = (): EventFilters => useSearchState(useShallow(pickFilters))

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
