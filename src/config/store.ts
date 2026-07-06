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
