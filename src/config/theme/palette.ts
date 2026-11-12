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
import labPlugin from 'colord/plugins/lab'

// `a11y` adds `.contrast()`, which picks a black or white on-color by WCAG ratio.
// `lab` adds `.delta()`, the only colour-versus-colour measure here.
extend([a11yPlugin, labPlugin])

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
// ⚠ `secondary` and `contrast` are retuned from `#A1C3D7` and `#e08e79`, which
// rendered at 2.0:1 and 2.5:1 against white and so failed `surface`. `primary`
// keeps its seed: no teal passes `panel-text` at any saturation worth calling
// teal, so the correction below moves its text step instead.
// ⚠ SahajCloud's `ATLAS_DEFAULT_COLORS` (`src/lib/clients/appearance.ts`) mirrors
// these three.
export const DEFAULT_SEEDS = {
  primary: '#1E6C71',
  secondary: '#5e98ba',
  contrast: '#d8735a',
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

// Dark mode caps its lightness too. White passes `surface` on the dark page, so
// without a cap a near-white brand renders near-white — and three near-white
// seeds render three pins nobody can tell apart. At 65 the seed's hue reads as a
// colour rather than a tint, so pale tan, pale blue and pale pink become tan,
// blue and pink.
const DARK_MAX_LIGHTNESS = 65

// The page and panel surface, `--background`, uses the ladder's app-background step.
// So a themed background is a near-white tint of the seed's hue in light mode, and a near-black tint in dark mode.
// This shade stays light or dark enough to keep the fixed neutral text legible.
// The surface never uses the seed's raw shade, which would otherwise blacken the panel for a near-black seed.
const BACKGROUND_STEP: Step = 1

// The brand solid. `ColorScale.on` is this step's on-color by definition, and the
// map's pins and cluster bubbles are filled from it, so it is exported rather
// than re-declared in each consumer.
export const SOLID_STEP: Step = 9

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * The legibility checks every role is corrected until it passes.
 *
 * There is deliberately no basemap check: a pin, a bubble and a ring each carry a
 * fixed outline for the style they are drawn on (`Mapbox/markers.ts`), so no brand
 * colour is ever measured against the map.
 */
export const PALETTE_CHECKS = ['panel-text', 'surface', 'selected-distinct', 'near-white'] as const

export type PaletteCheck = (typeof PALETTE_CHECKS)[number]

export type BrandRole = (typeof BRAND_ROLES)[number]

const PANEL_TEXT_RATIO = 4.5
const SURFACE_RATIO = 3

// ⚠ `colord`'s `delta()` answers CIEDE2000 **divided by 100**, so this is ΔE2000
// 20 — a difference anyone sees — and not the imperceptible 0.2 it reads as.
const SELECTED_DELTA = 0.2

// The app surface step 9 is measured against: `--background` in `globals.css`,
// which is fixed rather than tenant-wired.
const APP_BACKGROUND: Record<ThemeMode, string> = { light: '#ffffff', dark: '#121212' }

// Step 11 is panel text, and `text-*-11` on `bg-*-3` is its common pairing. Step 3
// is the worst of the three in both modes, so checking all three costs nothing and
// states the rule rather than its shortcut.
const PANEL_STEPS = [1, 2, 3] as const

// How far step 9 may travel for `selected-distinct`. The same two limits the clamp
// below applies, taken as a range rather than a nudge: near hue 60 or 184 two
// same-hue seeds need about 35 lightness points between them.
const SOLID_RANGE: Record<ThemeMode, readonly [number, number]> = {
  light: [0, LIGHT_MAX_LIGHTNESS],
  // ⚠ Up to 100, past the near-white cap: two same-hue seeds can need the extra
  // room to separate, and a selected pin that matches its neighbours is worse
  // than a pale one.
  dark: [DARK_MIN_LIGHTNESS, 100],
}

// Light mode darkens, dark mode lightens — both move a step away from its own
// background. The smallest shift that passes, so a seed that already passes never
// moves at all.
function correct(start: number, mode: ThemeMode, passes: (lightness: number) => boolean): number {
  const direction = mode === 'dark' ? 1 : -1

  for (let l = start; l >= 0 && l <= 100; l += direction) if (passes(l)) return l

  return mode === 'dark' ? 100 : 0
}

/** A role's ramp, and which checks had to move a step to produce it. */
export type RoleScale = { scale: ColorScale; adjustedBy: PaletteCheck[] }

// This derives a 12-step color scale from a seed hex, for the given mode.
// Steps 1 through 8, and 12, walk the fixed lightness ladder at the seed's hue and capped saturation.
// Step 9 is the brand solid: the seed's own lightness, clamped to stay visible, then corrected until it passes `surface`.
// Step 10 is its hover tone.
// Step 11 is panel text, corrected until it passes `panel-text`.
// `on` is the readable on-color for the solid, computed after the correction.
function buildRole(seedHex: string, mode: ThemeMode): RoleScale {
  const { h, s, l } = colord(seedHex).toHsl()
  const saturation = Math.min(s, MAX_SATURATION)
  const ladder = mode === 'dark' ? DARK_L : LIGHT_L
  const tone = (lightness: number) => colord({ h, s: saturation, l: lightness })
  const adjustedBy: PaletteCheck[] = []

  // Step 9, the solid, uses the seed's own lightness, clamped to stay visible.
  const maxLightness = mode === 'dark' ? DARK_MAX_LIGHTNESS : LIGHT_MAX_LIGHTNESS
  const clamped =
    mode === 'dark' ? clamp(l, DARK_MIN_LIGHTNESS, maxLightness) : Math.min(l, maxLightness)

  // Reported, unlike the near-black floor: it is the cap that turns a pale brand
  // into a visibly different colour, which is what a volunteer needs telling.
  if (l > maxLightness) adjustedBy.push('near-white')
  const l9 = correct(clamped, mode, (c) => tone(c).contrast(APP_BACKGROUND[mode]) >= SURFACE_RATIO)

  if (l9 !== clamped) adjustedBy.push('surface')

  const l11 = correct(ladder[11], mode, (c) =>
    PANEL_STEPS.every((step) => tone(c).contrast(tone(ladder[step])) >= PANEL_TEXT_RATIO),
  )

  if (l11 !== ladder[11]) adjustedBy.push('panel-text')

  // Step 10, the hovered solid, nudges toward the canvas edge.
  // It goes darker in light mode and lighter in dark mode.
  const l10 = mode === 'dark' ? clamp(l9 + 6, 0, 95) : clamp(l9 - 6, 5, 100)
  const scale = { on: foregroundFor(tone(l9)) } as ColorScale

  for (let step = 1 as Step; step <= 12; step = (step + 1) as Step) {
    const stepL =
      step === SOLID_STEP
        ? l9
        : step === 10
          ? l10
          : step === 11
            ? l11
            : ladder[step as Exclude<Step, 9 | 10>]

    scale[step] = channel(h, saturation, stepL)
  }

  return { adjustedBy, scale }
}

/** One role's 12-step ramp for a mode. */
export function buildScale(seedHex: string, mode: ThemeMode): ColorScale {
  return buildRole(seedHex, mode).scale
}

/**
 * Every usable role's ramp, with `contrast`'s solid moved away from `primary`'s.
 *
 * ⚠ **`selected-distinct` compares two roles, so it cannot live in `buildRole`.**
 * This is the only entry point that sees the whole palette, and the paint
 * (`applyPalette`), the map (`markerColors`) and the report (`paletteReport`) all
 * come through it — so what a viewer sees and what the report says cannot disagree.
 *
 * A role with no usable seed is absent, which is the refusal `setRole` already
 * makes by writing nothing.
 */
export function buildPalette(
  palette: PaletteRoles,
  mode: ThemeMode,
): Partial<Record<BrandRole, RoleScale>> {
  const built: Partial<Record<BrandRole, RoleScale>> = {}

  for (const role of BRAND_ROLES) {
    const seed = palette[role]

    if (seed && isBrandSeed(seed)) built[role] = buildRole(seed, mode)
  }

  const { contrast, primary } = built

  if (contrast && primary) separateSolid(contrast, hexOf(primary.scale[SOLID_STEP]), mode)

  return built
}

// The selected class must read as a different colour from the ones around it, so
// `contrast`'s solid moves away from `primary`'s until it does — the nearest
// lightness in the mode's whole range that clears ΔE2000 20 and still passes
// `surface`. With none, the furthest apart the range reaches, which is the trade
// #389 accepted near hues 60 and 184 in dark mode.
// ⚠ That trade gives up the separation alone, so the fallback is chosen only from
// the lightnesses that pass `surface` — starting at the one `buildRole` just
// corrected, which passes by construction.
function separateSolid(role: RoleScale, primarySolid: string, mode: ThemeMode): void {
  const [low, high] = SOLID_RANGE[mode]
  const { h, s, l } = colord(`hsl(${role.scale[SOLID_STEP]})`).toHsl()
  const tone = (lightness: number) => colord({ h, s, l: lightness })
  const delta = (lightness: number) => tone(lightness).delta(primarySolid)
  const legible = (lightness: number) =>
    tone(lightness).contrast(APP_BACKGROUND[mode]) >= SURFACE_RATIO

  if (delta(l) >= SELECTED_DELTA) return

  let best = l

  for (let offset = 1; offset <= 100; offset += 1) {
    for (const candidate of [l + offset, l - offset]) {
      if (candidate < low || candidate > high) continue
      if (!legible(candidate)) continue
      if (delta(candidate) > delta(best)) best = candidate
      if (delta(candidate) >= SELECTED_DELTA) {
        applySolid(role, h, s, candidate, mode)

        return
      }
    }
  }

  applySolid(role, h, s, best, mode)
}

function applySolid(role: RoleScale, h: number, s: number, l9: number, mode: ThemeMode): void {
  role.scale[SOLID_STEP] = channel(h, s, l9)
  role.scale[10] = channel(h, s, mode === 'dark' ? clamp(l9 + 6, 0, 95) : clamp(l9 - 6, 5, 100))
  role.scale.on = foregroundFor(colord({ h, s, l: l9 }))
  role.adjustedBy.push('selected-distinct')
}

/** What the atlas rendered for each role, and why it is not what was entered. */
export type RoleReport = {
  /** The seed the service chose, verbatim. */
  entered: string | null
  /** The step-9 hex that renders in each mode. */
  light: string
  dark: string
  /**
   * A seed that renders unchanged in light mode, or `null` when no light-mode check
   * moved step 9 — ⚠ which includes a role adjusted only by `panel-text`, since that
   * moves a ladder step no seed can express.
   */
  suggested: string | null
  /** The checks that moved a step, in each mode. */
  lightAdjustedBy: PaletteCheck[]
  darkAdjustedBy: PaletteCheck[]
}

export type PaletteReport = Partial<Record<BrandRole, RoleReport>>

// ⚠ **A rendered step 9 is not always a seed that renders itself.** The ladder
// works in HSL and the hex it emits is a quantisation of that, so feeding the hex
// back can land a point away and be corrected again — which would offer the
// volunteer a suggestion that changes the colour a second time. This walks to the
// seed that renders unchanged, which is at most a step or two away. The bound is
// a guard, not a budget: with no fixed point the entered colour's own rendering
// is still the honest answer.
function settledSeed(start: string, palette: PaletteRoles, role: BrandRole): string {
  const seen = new Set<string>()
  let seed = start

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const built = buildPalette({ ...palette, [role]: seed }, 'light')[role]

    if (!built) return seed

    const rendered = hexOf(built.scale[SOLID_STEP])

    if (rendered === seed) return seed

    // Two candidates can render each other, each landing a point the other side
    // of the bar. Stepping one further in the correcting direction settles it
    // with margin, where following the rendering alone would oscillate forever.
    seed = seen.has(rendered)
      ? shiftHex(rendered, { lightness: -1, maxLightness: 100, saturation: 0 })
      : rendered
    seen.add(rendered)
  }

  return seed
}

/** Each role's rendered solid and the checks that moved it, in both modes. */
export function paletteReport(palette: PaletteRoles): PaletteReport {
  const light = buildPalette(palette, 'light')
  const dark = buildPalette(palette, 'dark')
  const report: PaletteReport = {}

  for (const role of BRAND_ROLES) {
    const inLight = light[role]

    if (!inLight || !dark[role]) continue

    const movedSolid = inLight.adjustedBy.some((check) => check !== 'panel-text')
    const lightHex = hexOf(inLight.scale[SOLID_STEP])

    report[role] = {
      dark: hexOf(dark[role].scale[SOLID_STEP]),
      darkAdjustedBy: [...dark[role].adjustedBy],
      entered: palette[role] ?? null,
      lightAdjustedBy: [...inLight.adjustedBy],
      light: lightHex,
      suggested: movedSolid ? settledSeed(lightHex, palette, role) : null,
    }
  }

  return report
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

// The map paints in hex. An SVG `fill` attribute and a Mapbox paint both refuse the channel
// triples above, and neither can read a CSS variable.
// So these three accessors exist, and `colord` stays in this file, the only one that knows the ladder.
//
// `stepHex` and `onHex` return null for a seed that is absent, invalid or achromatic.
// That is the refusal `setRole` already makes by writing nothing.
// So each caller falls back to its own built-in default, rather than to a washed-out grey ramp.

// `channel()` emits the CSS space-separated HSL syntax, so colord parses it back.
// Never hand-roll that parse: it would be a second, unpinned copy of the format
// above.
const hexOf = (channels: string): string => colord(`hsl(${channels})`).toHex()

/** One step of an already-built ramp, as `#rrggbb`. */
export const scaleHex = (scale: ColorScale, step: Step): string => hexOf(scale[step])

/** One step of a seed's ramp, as `#rrggbb`. */
export function stepHex(
  seedHex: string | null | undefined,
  mode: ThemeMode,
  step: Step,
): string | null {
  if (!seedHex || !isBrandSeed(seedHex)) return null

  return hexOf(buildScale(seedHex, mode)[step])
}

/** The readable on-color for a seed's solid step, as `#rrggbb`. */
export function onHex(seedHex: string | null | undefined, mode: ThemeMode): string | null {
  if (!seedHex || !isBrandSeed(seedHex)) return null

  return hexOf(buildScale(seedHex, mode).on)
}

// ⚠ This one sits BELOW the ladder: no mode, no `isBrandSeed`, and no saturation
// cap. Feed it only a color the ladder produced, and only a negative saturation
// shift, or it hands back a tone outside the muted brand register this file
// exists to enforce.
export function shiftHex(
  hex: string,
  shift: { lightness: number; saturation: number; maxLightness: number },
): string {
  const { h, s, l } = colord(hex).toHsl()

  return colord({
    h,
    s: clamp(s + shift.saturation, 0, 100),
    l: clamp(l + shift.lightness, 0, shift.maxLightness),
  }).toHex()
}

const setRole = (root: HTMLElement, token: BrandRole, scale: ColorScale) => {
  root.style.setProperty(`--${token}-on`, scale.on)
  for (let step = 1 as Step; step <= 12; step = (step + 1) as Step) {
    root.style.setProperty(`--${token}-${step}`, scale[step])
  }
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

  // Through `buildPalette`, so the paint carries `selected-distinct` and matches
  // what `paletteReport` and the map say about the same palette.
  const built = buildPalette(palette, mode)

  for (const role of BRAND_ROLES) {
    const resolved = built[role]

    if (resolved) setRole(root, role, resolved.scale)
  }

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
