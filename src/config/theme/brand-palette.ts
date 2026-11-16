import type { PaletteRoles } from './palette'

import { createContext, useContext } from 'react'

// `BrandTheme` resolves the active palette per role and paints it as CSS variables.
// The map cannot read those: an SVG `fill` and a Mapbox paint take a literal color.
// So `BrandTheme` hands the same resolved roles down here, and the map derives its own hexes.
//
// Reading the variables back with `getComputedStyle` would need a second change signal, and a role
// that fell back to the built-in default writes no variable at all (`applyPalette`).

/**
 * This is what a subtree with no `BrandTheme` above it renders as: no tenant seed, so the stock
 * marker art.
 *
 * ⚠ It is one module object on purpose. The map memoises its marker colors on this value's
 * identity, so a fresh `{}` per render would re-register an unbranded embed's four images.
 */
export const NO_BRAND_PALETTE: PaletteRoles = {}

export const BrandPaletteContext = createContext<PaletteRoles>(NO_BRAND_PALETTE)

/** This returns the roles the UI was painted from, for a consumer that needs a literal color. */
export const useBrandPalette = () => useContext(BrandPaletteContext)
