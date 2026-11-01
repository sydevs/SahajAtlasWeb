import type { PaletteRoles } from './palette'

import { create } from 'zustand/react'

type BrandPaletteState = {
  palette: PaletteRoles
  setPalette: (palette: PaletteRoles) => void
}

// `BrandTheme` resolves the active palette per role and paints it as CSS variables.
// The map cannot read those: an SVG `fill` and a Mapbox paint take a literal color.
// So `BrandTheme` publishes the same resolved roles here, and the map derives its own hexes from them.
//
// Reading the variables back with `getComputedStyle` would need a second change signal, and a role
// that fell back to the built-in default writes no variable at all (`applyPalette`).
//
// This is a module singleton, like the theme root. It assumes one widget per page.
export const useBrandPalette = create<BrandPaletteState>((set) => ({
  palette: {},
  setPalette: (palette) => set({ palette }),
}))
