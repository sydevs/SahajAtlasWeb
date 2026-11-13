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

// Generated scales keep the seed's hue and its lightness, and set its saturation.
// A dark brand color stays dark. A light one stays light.
// Every ramp with a hue is held between these two: a vivid or neon seed is pulled
// down into the brand register, and a muted, pale or near-neutral one is lifted
// until it reads as a colour — a brand that renders as grey tells a visitor nothing.
// Lifting is reported (`saturation`), since it changes the colour visibly.
// A seed with no hue at all, a true grey, white or black, stays neutral: there is no
// colour to lift.
const MIN_SATURATION = 40
const MAX_SATURATION = 60

// ⚠ HSL saturation overstates a colour near white or black: `#fffdfa` reads as 100%
// saturated with almost no colour in it. So "how colourful is this seed" is its
// chroma, doubled to the scale of HSL saturation at mid-lightness — which is what
// decides whether it needs lifting.
const CHROMA_GAIN = 2

const NOTICEABLE_LIFT = 10

const chromaOf = (saturation: number, lightness: number) =>
  saturation * (1 - Math.abs((2 * lightness) / 100 - 1))

// The band step 9, the solid, is held inside, per mode: light 20–80, dark 60–90.
// The darker edge keeps a brand off near-black on the white page and visible on the
// dark one; the lighter edge keeps it off near-white on either. `surface` then
// darkens whatever is still too pale for the white page. A move past the far edge
// is reported as `near-black` (light) or `near-white` (dark).
const TONE_RANGE: Record<ThemeMode, readonly [number, number]> = {
  light: [20, 80],
  dark: [60, 90],
}

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
export const PALETTE_CHECKS = [
  'panel-text',
  'surface',
  'selected-distinct',
  'saturation',
  'near-white',
  'near-black',
] as const

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

// How far step 9 may travel for `selected-distinct`: everything visible on the
// mode's canvas, past the far margin. Near hue 60 or 184 two same-hue seeds need
// about 35 lightness points between them, and a selected pin that matches its
// neighbours is worse than one near an extreme.
const SOLID_RANGE: Record<ThemeMode, readonly [number, number]> = {
  light: [0, TONE_RANGE.light[1]],
  dark: [TONE_RANGE.dark[0], 100],
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
// Steps 1 through 8, and 12, walk the fixed lightness ladder at the seed's hue and the brand saturation.
// Step 9 is the brand solid: the seed's own lightness, clamped to stay visible, then corrected until it passes `surface`.
// Step 10 is its hover tone.
// Step 11 is panel text, corrected until it passes `panel-text`.
// `on` is the readable on-color for the solid, computed after the correction.
function buildRole(seedHex: string, mode: ThemeMode): RoleScale {
  const { h, s, l } = colord(seedHex).toHsl()
  const colourfulness = Math.min(s, chromaOf(s, l) * CHROMA_GAIN)
  const saturation =
    s === 0 ? 0 : clamp(colourfulness, MIN_SATURATION, Math.max(MIN_SATURATION, MAX_SATURATION))
  const ladder = mode === 'dark' ? DARK_L : LIGHT_L
  const tone = (lightness: number) => colord({ h, s: saturation, l: lightness })
  const adjustedBy: PaletteCheck[] = []

  // Step 9, the solid, uses the seed's own lightness, held inside the band.
  // ⚠ A hued solid is also kept far enough from white and black to SHOW the floor:
  // near either extreme no saturation is visible, so a near-white seed lifted to the
  // floor still rendered near-white on the dark page, where nothing else moves it.
  // `reach` is how close to an extreme the solid's chroma still clears the floor.
  const reach = s === 0 ? 0 : (50 * MIN_SATURATION) / (CHROMA_GAIN * saturation)
  const [lowest, highest] = TONE_RANGE[mode]
  const clamped = clamp(l, Math.max(lowest, reach), Math.min(highest, 100 - reach))

  // ⚠ The lift and the band are two independent moves, so each reports itself. Deciding
  // one from whether the other had already reported gave two near-white seeds different
  // banners for the same journey, on nothing but how far under the floor they started.
  // The lift is reported only past one anyone would notice: our own teal sits two points
  // under the floor, and a banner over that would be noise.
  if (s > 0 && (colourfulness < MIN_SATURATION - NOTICEABLE_LIFT || l < reach || l > 100 - reach)) {
    adjustedBy.push('saturation')
  }

  if (mode === 'light' && l < lowest) {
    adjustedBy.push('near-black')
  } else if (mode === 'dark' && l > highest) {
    adjustedBy.push('near-white')
  }

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

// A brand seed is any valid colour but `#000000`, which is SahajCloud's "unconfigured"
// sentinel: client records once defaulted `color1`–`color3` to it. That one value is
// not written, and the static `globals.css` default, the built-in teal or orange,
// stands instead.
// ⚠ Only that value. A grey, a white or a near-white is somebody's choice and is
// painted as a neutral ramp — treating every achromatic seed as unset snapped a
// manager's pick to our teal, which read as the picker ignoring them.
// `background` is handled separately. Its shade always snaps to the near-white or near-black app-background step, regardless.
const UNCONFIGURED_SEED = '#000000'

const isBrandSeed = (seedHex: string): boolean => {
  const c = colord(seedHex)

  return c.isValid() && c.toHex() !== UNCONFIGURED_SEED
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
  // It honors the seed's hue, at the brand saturation.
  // Its shade comes from the Radix ladder's app-background step for the active mode, never from the seed's own lightness.
  // So a near-black seed, such as an unset `#000000` default, still yields a readable near-white surface in light mode, and a near-black surface in dark mode.
  // This keeps the fixed neutral text legible.
  // An invalid value fails closed to the static default.
  if (palette.background && colord(palette.background).isValid()) {
    root.style.setProperty('--background', buildScale(palette.background, mode)[BACKGROUND_STEP])
  }
}
