// Runtime brand theming for the embedded widget.
//
// The widget uses a Radix-Colors-style 12-step scale for each brand role.
// Each step is an HSL-channel CSS variable, from `--primary-1` to `--primary-12`.
// `--primary-contrast` is the on-color for the solid step.
// Tailwind reads each variable as `hsl(var(--primary-9) / <alpha>)`.
// These are plain custom properties.
// So the app can repaint the whole widget at runtime, by setting these variables inline on a wrapper element.
// Inline values override the static defaults in `globals.css`, and they cascade to every component.
//
// The 12 steps follow Radix Colors semantics:
//   1  app background        2  subtle background
//   3  component bg          4  hovered component bg   5  active/selected bg
//   6  subtle border         7  border / focus ring    8  hovered border
//   9  solid                 10 hovered solid
//   11 low-contrast text     12 high-contrast text
//
// A tenant supplies one seed hex value for each role.
// `buildScale` derives the full ramp from that seed, aware of the current mode.
// `applyPalette` writes the resulting variables onto the root element.
// When no palette is supplied, none of this code runs.
// The static `globals.css` defaults, the built-in teal and orange, then stand unchanged.

import { colord, extend, type Colord } from 'colord'
import a11yPlugin from 'colord/plugins/a11y'

// This plugin adds `.contrast()`. It picks a black or white on-color by WCAG ratio.
extend([a11yPlugin])

export type ThemeMode = 'light' | 'dark'

// This holds one seed hex value for each themeable role.
// A role may be omitted. An omitted role falls back to the built-in default.
// `background` tints the page surface in both modes.
// It uses the seed's hue and saturation, at the Radix app-background shade.
export type PaletteRoles = {
  primary?: string | null
  secondary?: string | null
  contrast?: string | null
  background?: string | null
}

// These are the three themeable brand roles. Each seed produces a 12-step ramp.
// `background` uses a different derivation, the app-background shade only.
// So `background` stays separate from this list.
export const BRAND_ROLES = ['primary', 'secondary', 'contrast'] as const

export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

// This type holds a 12-step ramp of channels, plus `on`.
// `on` is the readable on-color for the solid step, step 9.
// The code writes `on` to the `--{role}-on` variable. Tailwind exposes it as `{role}-foreground`.
// This field is named `on`, not `contrast`, so it does not collide with the `contrast` brand role.
export type ColorScale = Record<Step, string> & { on: string }

// These are the built-in brand seeds, used when no tenant supplies its own.
// They are the SY teal primary, the soft blue secondary, and the warm contrast.
// The static defaults in `globals.css` are these seeds run through `buildScale()`.
// The `palette.defaults.test.ts` gate asserts that both stay in sync.
// So a ladder change cannot silently desync the default theme from every tenant theme.
export const DEFAULT_SEEDS = {
  primary: '#1E6C71',
  secondary: '#A1C3D7',
  contrast: '#e08e79',
} as const

// This holds fixed per-step lightness, as HSL L%, for steps 1 through 8 and 11 through 12.
// Steps 1 through 8 walk from the near-white app background down through the borders.
// Steps 11 and 12 are the text steps.
// Step 9, the solid, and step 10, the hovered solid, derive from the seed itself instead.
// This keeps the brand color true, so these two steps are absent here.
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

// Dark mode inverts the ladder. Low-lightness backgrounds climb up to light text.
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

// This is the channel format: space-separated `<h> <s>% <l>%`, with no `hsl()` wrapper.
const channel = (h: number, s: number, l: number) =>
  `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`

const BLACK = '0 0% 0%'
const WHITE = '0 0% 100%'

// This returns black or white, whichever reads better on the given color, by WCAG contrast.
const foregroundFor = (c: Colord) =>
  c.contrast('#000000') >= c.contrast('#ffffff') ? BLACK : WHITE

// Generated scales keep the seed's hue and its lightness.
// A dark brand color stays dark. A light one stays light.
// This code caps only the saturation.
// The cap is the one normalization step.
// It pulls a vivid or neon seed into the muted brand register, near 23% for the built-in teal and 62% for orange.
// This keeps its tints from reading as glaring.
// A muted or neutral seed passes through untouched, through `min(s, 60)`.
// So a gray seed stays gray.
const MAX_SATURATION = 60

// This keeps the solid step, step 9, visible against the canvas at either extreme.
// Light mode caps its lightness, so a near-white brand still shows on the light page.
// Dark mode floors its lightness, so a near-black brand still shows on the dark page.
// A normal mid-toned brand sits between these limits and passes through as-is.
const LIGHT_MAX_LIGHTNESS = 70
const DARK_MIN_LIGHTNESS = 60

// The page and panel surface, `--background`, uses the ladder's app-background step.
// So a themed background is a near-white tint of the seed's hue in light mode, and a near-black tint in dark mode.
// This shade stays light or dark enough to keep the fixed neutral text legible.
// The surface never uses the seed's raw shade, which would otherwise blacken the panel for a near-black seed.
const BACKGROUND_STEP: Step = 1

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// This derives a 12-step color scale from a seed hex, for the given mode.
// Steps 1 through 8, and 11 through 12, walk the fixed lightness ladder at the seed's hue and capped saturation.
// Step 9 is the brand solid: the seed's own lightness, clamped to stay visible.
// Step 10 is its hover tone.
// `on` is the readable on-color for the solid.
export function buildScale(seedHex: string, mode: ThemeMode): ColorScale {
  const { h, s, l } = colord(seedHex).toHsl()
  const saturation = Math.min(s, MAX_SATURATION)
  const ladder = mode === 'dark' ? DARK_L : LIGHT_L

  // Step 9, the solid, uses the seed's own lightness, clamped to stay visible.
  // Step 10, the hovered solid, nudges toward the canvas edge.
  // It goes darker in light mode and lighter in dark mode.
  const l9 = mode === 'dark' ? Math.max(l, DARK_MIN_LIGHTNESS) : Math.min(l, LIGHT_MAX_LIGHTNESS)
  const l10 = mode === 'dark' ? clamp(l9 + 6, 0, 95) : clamp(l9 - 6, 5, 100)

  const scale = { on: foregroundFor(colord({ h, s: saturation, l: l9 })) } as ColorScale

  for (let step = 1 as Step; step <= 12; step = (step + 1) as Step) {
    const stepL = step === 9 ? l9 : step === 10 ? l10 : ladder[step as Exclude<Step, 9 | 10>]

    scale[step] = channel(h, saturation, stepL)
  }

  return scale
}

// A brand seed must carry a real hue.
// A fully desaturated seed, black, white, or grey, is the backend's "unconfigured" sentinel, not a brand color.
// The client record defaults `color1` through `color3` to `#000000`.
// Painting that seed's ramp would wash the whole widget grey, since a `#000000` seed produces a 0%-saturation ramp.
// So this code treats an achromatic seed like an invalid one.
// It does not write that role, and the static `globals.css` default, the built-in teal or orange, stands instead.
// `background` is handled separately. Its shade always snaps to the near-white or near-black app-background step, regardless.
const MIN_BRAND_SATURATION = 5

const isBrandSeed = (seedHex: string): boolean => {
  const c = colord(seedHex)

  return c.isValid() && c.toHsl().s >= MIN_BRAND_SATURATION
}

const setRole = (root: HTMLElement, token: string, seedHex: string, mode: ThemeMode) => {
  if (!isBrandSeed(seedHex)) return false

  const scale = buildScale(seedHex, mode)

  root.style.setProperty(`--${token}-on`, scale.on)
  for (let step = 1 as Step; step <= 12; step = (step + 1) as Step) {
    root.style.setProperty(`--${token}-${step}`, scale[step])
  }

  return true
}

// This lists every inline variable `applyPalette` can write.
// The code clears all of them before each apply.
// So a role dropped between applies, or an invalid value, falls back to the static theme instead of leaving a stale override.
// The code cannot blanket-clear the root's inline style, because the widget wrapper carries `display: contents` there.
const MANAGED_VARS = [
  ...BRAND_ROLES.flatMap((token) => [
    `--${token}-on`,
    ...Array.from({ length: 12 }, (_, i) => `--${token}-${i + 1}`),
  ]),
  '--background',
]

// This repaints a root element in the supplied palette, by writing the brand CSS variables inline.
// It resets to the static theme first, then layers on only the supplied roles.
// So an omitted role falls back to the built-in default.
// `mode` drives the per-step ladder, including the background surface's shade.
export function applyPalette(root: HTMLElement, palette: PaletteRoles, mode: ThemeMode) {
  for (const name of MANAGED_VARS) root.style.removeProperty(name)

  if (palette.primary) setRole(root, 'primary', palette.primary, mode)
  if (palette.secondary) setRole(root, 'secondary', palette.secondary, mode)
  if (palette.contrast) setRole(root, 'contrast', palette.contrast, mode)

  // The background surface derives like every other role.
  // It honors the seed's hue and capped saturation.
  // Its shade comes from the Radix ladder's app-background step for the active mode, never from the seed's own lightness.
  // So a near-black seed, such as an unset `#000000` default, still yields a readable near-white surface in light mode, and a near-black surface in dark mode.
  // This keeps the fixed neutral text legible.
  // An invalid value fails closed to the static default.
  if (palette.background && colord(palette.background).isValid()) {
    root.style.setProperty('--background', buildScale(palette.background, mode)[BACKGROUND_STEP])
  }
}
