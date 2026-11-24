import type { GlobalProvider } from '@ladle/react'

import { useEffect, useRef } from 'react'
import { ActionType, ThemeState, useLadleContext } from '@ladle/react'
import { MemoryRouter } from 'react-router'
import clsx from 'clsx'
import { I18nextProvider } from 'react-i18next'

import { installBackend } from './backend'
import storyI18n from './i18n'

import Providers from '@/providers'
import { applyTheme, useTheme } from '@/hooks/use-theme'
import { BrandPaletteContext, NO_BRAND_PALETTE } from '@/config/theme/brand-palette'
import { applyPalette, type PaletteRoles } from '@/config/theme/palette'
import { WIDGET_SCOPE_CLASS } from '@/lib/scope'
import { VIEW_CONTROLS } from '@/views/story-controls'

import '@/styles/globals.css'
// Stories mount components without App. So this file also registers the
// self-hosted faces (#91). Without this line, every preview renders in
// the fallback system sans-serif font.
import '@/styles/fonts'

// Ladle has no widget wrapper. `<html>` is the theme root here, exactly
// as in the standalone build. So `<html>` must carry the style scope
// class, or no rule in the sheet matches anything (issue #91). This code
// runs at module scope, not inside an effect. An effect runs after the
// first render, so every story would paint unstyled for one frame.
//
// Warning: this alone is not enough, and the gap stays invisible until
// you hit it. Ladle's viewport control (`?width=…`) re-renders the story
// inside an iframe. This side effect ran against the document that
// loaded the module, not the document the story lands in. The iframe got
// the stylesheet but no `.sy-atlas` class, so every rule matched nothing,
// and every component rendered with browser defaults. The wrapper below
// also carries the class. That is what makes this work in any document.
if (typeof document !== 'undefined') {
  document.documentElement.classList.add(WIDGET_SCOPE_CLASS)
}

// Every SahajCloud read a story makes is answered from fixtures (`./backend.ts`).
if (typeof window !== 'undefined') installBackend()

// Brand presets sampled from real tenants (issue #16). Selecting one runs
// the production applyPalette on the story wrapper, so Ladle previews
// exactly what an embed renders. The first preset is the default. It
// applies no override, so it uses the built-in green and coral colors.
// ⚠ Each preset is one module object: the map memoises its marker colors on
// the palette's identity, so a fresh object per render would re-register them.
const PALETTES: Record<string, PaletteRoles> = {
  'wemeditate.com': NO_BRAND_PALETTE,
  'shrimataji.org': { primary: '#64032E', secondary: '#A11F0C', background: '#F0ECE2' },
  'sahajayoga.org': { primary: '#5D6F44', secondary: '#D47B2C' },
}

const PALETTE_NAMES = Object.keys(PALETTES)
const DEFAULT_PALETTE = PALETTE_NAMES[0]

const PALETTE_CONTROL = {
  type: 'select',
  name: 'Brand palette',
  options: PALETTE_NAMES,
  defaultValue: DEFAULT_PALETTE,
  value: DEFAULT_PALETTE,
  description: 'Tenant brand palette applied via the production applyPalette',
}

// The view stories' own controls' values (`src/views/story-controls.ts`), kept from story to
// story, so a reviewer browsing the views in one setup stays in it.
const viewControlValues: Record<string, unknown> = {}

// Global decorator for every story.
//
// This mirrors src/providers.tsx: React Query and Helmet, with no
// UI-library provider — Radix primitives are headless and need none.
// This decorator supplies two things the app entry normally provides,
// that a story otherwise lacks:
//
//   1. A Router. Radix components are headless, but many components
//      still call react-router hooks (Link, useNavigate,
//      useSearchParams). MemoryRouter keeps the preview URL clean.
//   2. i18n with bundled resources (see ./i18n), wired through
//      I18nextProvider.
//
// In production, the widget injects its CSS through JS. So each story
// must import globals.css directly.
//
// Theme: Ladle's own light, dark, and auto toggle drives the whole
// canvas. This decorator maps the active theme onto the root `light` or
// `dark` class, through the same applyTheme seam useTheme uses. Tailwind
// (darkMode: 'class') and useTheme both read that class. So flipping
// Ladle's toggle re-themes every story, including the Mapbox basemap,
// which follows useTheme. `auto` resolves against the OS preference, and
// it tracks that preference live. The wrapper carries `bg-background`,
// so the whole preview area follows the app theme, including when a
// story's own <ThemeSwitch> toggles it, not only Ladle's toolbar.
// Ladle's own chrome stays on Ladle's theme — that is expected.
//
// Brand palette: a native Ladle control, registered on every story (see
// below), applies a tenant preset to the story wrapper through the
// production applyPalette. It re-applies whenever the palette or the
// resolved light/dark theme changes. It also hands the preset down through
// BrandPaletteContext, as BrandTheme does, so the map's markers follow it.
export const Provider: GlobalProvider = ({ children }) => {
  const { globalState, dispatch } = useLadleContext()
  const ladleTheme = globalState.theme

  useEffect(() => {
    if (ladleTheme === ThemeState.Auto) {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const sync = () => applyTheme(media.matches ? 'dark' : 'light')

      sync()
      media.addEventListener('change', sync)

      return () => media.removeEventListener('change', sync)
    }

    applyTheme(ladleTheme === ThemeState.Dark ? 'dark' : 'light')
  }, [ladleTheme])

  const wrapperRef = useRef<HTMLElement>(null)
  const { theme } = useTheme()

  // View stories are full-view drawer pages, each owning the whole canvas
  // through the ViewHarness, and the whole widget's story is a host page. So
  // both fill Ladle's main area edge to edge: no component-preview padding of
  // ours, and none of Ladle's own around it. Every other tier keeps both.
  const isView = globalState.story?.startsWith('views--')
  const fullBleed = isView || globalState.story?.startsWith('interactive--')

  useEffect(() => {
    if (!fullBleed) return

    const root = document.documentElement.style

    root.setProperty('--ladle-main-padding', '0')
    root.setProperty('--ladle-main-padding-mobile', '0')

    return () => {
      root.removeProperty('--ladle-main-padding')
      root.removeProperty('--ladle-main-padding-mobile')
    }
  }, [fullBleed])

  const { control, controlInitialized } = globalState

  useEffect(() => {
    for (const key of Object.keys(VIEW_CONTROLS)) {
      if (control[key]) viewControlValues[key] = control[key].value
    }
  }, [control])

  // The brand palette is a first-class Ladle control, in the Controls
  // panel, not a custom <select>. Ladle wipes control state on each
  // story change. The args provider only re-seeds a story's own args. So
  // this effect re-adds the palette control whenever it is missing, but
  // only after the story's controls finish initializing. This effect
  // merges onto the story's own controls. It never overwrites them. The
  // args provider's effect runs once per story (deps []), so it never
  // wipes the palette control back out afterward.
  //
  // Every view, and only views, gets the view controls too.
  useEffect(() => {
    if (!controlInitialized) return

    const missing = isView
      ? Object.entries(VIEW_CONTROLS)
          .filter(([key]) => !control[key])
          .map(([key, def]) => [key, { ...def, value: viewControlValues[key] ?? def.defaultValue }])
      : []

    if (control.palette && missing.length === 0) return

    dispatch({
      type: ActionType.UpdateControl,
      value: {
        ...control,
        palette: control.palette ?? PALETTE_CONTROL,
        ...Object.fromEntries(missing),
      },
    })
  }, [control, controlInitialized, isView, dispatch])

  const palette = PALETTES[control.palette?.value ?? DEFAULT_PALETTE] ?? NO_BRAND_PALETTE

  // This repaints the wrapper when the chosen palette or the resolved
  // theme changes. applyPalette resets the managed variables before it
  // applies new ones. So switching back to the default restores the
  // built-in palette on its own.
  useEffect(() => {
    const el = wrapperRef.current

    if (!el) return

    applyPalette(el, palette, theme)
  }, [palette, theme])

  return (
    <I18nextProvider i18n={storyI18n}>
      {/* Keyed on the story, so each one starts at `/`, not where the last one navigated. */}
      <MemoryRouter key={globalState.story}>
        <Providers>
          {/* The scope class sits on both this wrapper and <html>, on purpose.
              See the note at the top of this file: in viewport mode, the story
              renders into an iframe that the module-scope class never reaches.
              Only an ancestor inside the tree travels with it.

              The theme class has to travel with it. The palette block's `:root`
              arm is emitted as a bare `:where(.sy-atlas)`, so a second scope
              element carrying no theme class re-declares the LIGHT palette for
              everything below it — which left every story light while <html>
              said dark. */}
          <main
            ref={wrapperRef}
            className={clsx(
              WIDGET_SCOPE_CLASS,
              theme,
              'min-h-screen bg-background text-foreground',
              !fullBleed && 'p-6',
            )}
          >
            <BrandPaletteContext.Provider value={palette}>{children}</BrandPaletteContext.Provider>
          </main>
        </Providers>
      </MemoryRouter>
    </I18nextProvider>
  )
}
