// Runtime brand theming for the embedded widget.
//
// The widget consumes a Radix-Colors-style 12-step scale per brand role. Each
// step is an HSL-*channel* CSS variable — `--primary-1 … --primary-12` plus
// `--primary-contrast` (the on-color for the solid) — read by Tailwind as
// `hsl(var(--primary-9) / <alpha>)`. Because they're plain custom properties, we
// can repaint the whole widget at runtime by setting those vars inline on a
// wrapper element: inline values beat the static defaults in globals.css and
// cascade to every component.
//
// The 12 steps follow Radix Colors semantics:
//   1  app background        2  subtle background
//   3  component bg          4  hovered component bg   5  active/selected bg
//   6  subtle border         7  border / focus ring    8  hovered border
//   9  solid                 10 hovered solid
//   11 low-contrast text     12 high-contrast text
//
// A tenant supplies one seed hex per role; `buildScale` derives the full ramp
// (mode-aware) from it, and `applyPalette` writes the vars onto the root. When no
// palette is supplied nothing here runs and the static globals.css defaults (the
// built-in teal/orange) stand unchanged.

import { colord, extend, type Colord } from 'colord'
import a11yPlugin from 'colord/plugins/a11y'

// `.contrast()` (used to pick a black/white on-color by WCAG ratio).
extend([a11yPlugin])

export type ThemeMode = 'light' | 'dark'

// One seed hex per themeable role; any role may be omitted (then it's left to
// the built-in default). `background` tints the page surface in both modes,
// using the seed's hue/saturation at the Radix app-background shade.
export type PaletteRoles = {
  primary?: string | null
  secondary?: string | null
  background?: string | null
}

export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

// A 12-step ramp (channels) plus the on-color for the solid (step 9).
export type ColorScale = Record<Step, string> & { contrast: string }

// The built-in (no-tenant) brand seeds — the SY teal / secondary orange. The
// static defaults in globals.css are these run through buildScale(); the
// palette.defaults.test.ts gate asserts they stay in sync, so a ladder change
// can't silently desync the default theme from every tenant theme.
export const DEFAULT_SEEDS = { primary: '#82b1ae', secondary: '#e08e79' } as const

// Fixed per-step lightness (HSL L%) for steps 1–8 and 11–12. Steps 1–8 walk from
// the near-white app background down through the borders; 11–12 are the text
// steps. Step 9 (solid) and 10 (hovered solid) are derived from the seed itself
// so the brand color reads true, so they're absent here.
const LIGHT_L: Record<Exclude<Step, 9 | 10>, number> = {
  1: 99,
  2: 97,
  3: 94,
  4: 90,
  5: 85,
  6: 79,
  7: 72,
  8: 63,
  11: 40,
  12: 24,
}

// Dark mode inverts the ladder: low-lightness backgrounds climbing to light text.
const DARK_L: Record<Exclude<Step, 9 | 10>, number> = {
  1: 9,
  2: 12,
  3: 16,
  4: 20,
  5: 24,
  6: 28,
  7: 34,
  8: 42,
  11: 72,
  12: 90,
}

// Channel format: space-separated `<h> <s>% <l>%`, no `hsl()` wrapper.
const channel = (h: number, s: number, l: number) =>
  `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`

const BLACK = '0 0% 0%'
const WHITE = '0 0% 100%'

// Black or white, whichever reads better on the given color (WCAG contrast).
const foregroundFor = (c: Colord) =>
  c.contrast('#000000') >= c.contrast('#ffffff') ? BLACK : WHITE

// Generated scales respect the seed's hue AND lightness — a dark brand color
// stays dark, a light one stays light — while CAPPING saturation. The cap is the
// one normalization: a vivid/neon seed is pulled into the muted brand register
// (the built-in teal ≈ 23%, orange ≈ 62%) so its tints don't read as glaring,
// while a muted or neutral seed passes through untouched (`min(s, 60)`, so e.g. a
// gray stays gray).
const MAX_SATURATION = 60

// Keep the solid (step 9) visible against the canvas at either extreme: light
// mode caps its lightness (a near-white brand wouldn't show on the light page),
// dark mode floors it (a near-black brand wouldn't show on the dark page). A
// normal mid-toned brand sits between these and is used as-is.
const LIGHT_MAX_LIGHTNESS = 70
const DARK_MIN_LIGHTNESS = 60

// The page/panel surface (`--background`) uses the ladder's app-background step,
// so a themed background is a near-white (light) / near-black (dark) tint of the
// seed's hue — light/dark enough to keep the fixed neutral text legible, rather
// than the seed's raw shade (a near-black seed would otherwise blacken the panel).
const BACKGROUND_STEP: Step = 1

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// Derive a 12-step color scale from a seed hex for the given mode. Steps 1–8 and
// 11–12 walk the fixed lightness ladder at the seed's hue + capped saturation;
// step 9 is the brand solid (the seed, lightness-clamped to stay visible) and 10
// its hover tone; `contrast` is the readable on-color for the solid.
export function buildScale(seedHex: string, mode: ThemeMode): ColorScale {
  const { h, s, l } = colord(seedHex).toHsl()
  const saturation = Math.min(s, MAX_SATURATION)
  const ladder = mode === 'dark' ? DARK_L : LIGHT_L

  // Step 9 (solid): the seed's own lightness, clamped to stay visible; step 10
  // (hovered solid) nudges toward the canvas edge (darker in light, lighter in
  // dark).
  const l9 = mode === 'dark' ? Math.max(l, DARK_MIN_LIGHTNESS) : Math.min(l, LIGHT_MAX_LIGHTNESS)
  const l10 = mode === 'dark' ? clamp(l9 + 6, 0, 95) : clamp(l9 - 6, 5, 100)

  const scale = { contrast: foregroundFor(colord({ h, s: saturation, l: l9 })) } as ColorScale

  for (let step = 1 as Step; step <= 12; step = (step + 1) as Step) {
    const stepL = step === 9 ? l9 : step === 10 ? l10 : ladder[step as Exclude<Step, 9 | 10>]

    scale[step] = channel(h, saturation, stepL)
  }

  return scale
}

const setRole = (root: HTMLElement, token: string, seedHex: string, mode: ThemeMode) => {
  if (!colord(seedHex).isValid()) return false

  const scale = buildScale(seedHex, mode)

  root.style.setProperty(`--${token}-contrast`, scale.contrast)
  for (let step = 1 as Step; step <= 12; step = (step + 1) as Step) {
    root.style.setProperty(`--${token}-${step}`, scale[step])
  }

  return true
}

// Every inline var applyPalette can write, cleared before each apply so a role
// dropped between applies — or an invalid value — falls back to the static theme
// instead of leaving a stale override. (We can't blanket-clear the root's inline
// style: the widget wrapper carries `display: contents` there.)
const MANAGED_VARS = [
  ...['primary', 'secondary'].flatMap((token) => [
    `--${token}-contrast`,
    ...Array.from({ length: 12 }, (_, i) => `--${token}-${i + 1}`),
  ]),
  '--background',
]

// Repaint a root element in the supplied palette by writing the brand CSS vars
// inline. Resets to the static theme first, then layers on only the supplied
// roles, so omitted roles fall back to the built-in default. `mode` drives the
// per-step ladder (including the background surface's shade).
export function applyPalette(root: HTMLElement, palette: PaletteRoles, mode: ThemeMode) {
  for (const name of MANAGED_VARS) root.style.removeProperty(name)

  if (palette.primary) setRole(root, 'primary', palette.primary, mode)
  if (palette.secondary) setRole(root, 'secondary', palette.secondary, mode)

  // The background surface is derived like every other role: the seed's hue and
  // (capped) saturation are honored, but the shade comes from the Radix ladder's
  // app-background step for the active mode — never the seed's own lightness. So
  // a near-black seed (e.g. an unset #000000 default) still yields a readable
  // near-white surface in light mode (near-black in dark), keeping the fixed
  // neutral text legible. An invalid value fails closed to the static default.
  if (palette.background && colord(palette.background).isValid()) {
    root.style.setProperty('--background', buildScale(palette.background, mode)[BACKGROUND_STEP])
  }
}
