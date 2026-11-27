import type { GlobalProvider, GlobalState } from '@ladle/react'

import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react'
import { ActionType, ThemeState, useLadleContext } from '@ladle/react'
import { MemoryRouter } from 'react-router'
import clsx from 'clsx'
import { Context as ResponsiveContext } from 'react-responsive'
import { I18nextProvider } from 'react-i18next'

import { installBackend } from './backend'
import storyI18n from './i18n'

import Providers from '@/providers'
import { applyTheme, useTheme } from '@/hooks/use-theme'
import { BrandPaletteContext, NO_BRAND_PALETTE } from '@/config/theme/brand-palette'
import { applyPalette, type PaletteRoles } from '@/config/theme/palette'
import { WIDGET_SCOPE_CLASS } from '@/lib/scope'

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

  const [wrapper, setWrapper] = useState<HTMLElement | null>(null)
  const { theme } = useTheme()

  // Ladle's own gutter is padding on its `main`, outside this wrapper, so in the dark theme it
  // drew a light frame round every story. The gutter moves inside, onto the wrapper that paints
  // the theme's background. The whole widget's story is a host page, so it fills the area.
  const isWidget = globalState.story?.startsWith('interactive--')

  useEffect(() => {
    const root = document.documentElement.style

    root.setProperty('--ladle-main-padding', '0')
    root.setProperty('--ladle-main-padding-mobile', '0')

    return () => {
      root.removeProperty('--ladle-main-padding')
      root.removeProperty('--ladle-main-padding-mobile')
    }
  }, [])

  // The brand palette is a first-class Ladle control, in the Controls
  // panel, not a custom <select>. Ladle wipes control state on each
  // story change. The args provider only re-seeds a story's own args. So
  // this effect re-adds the palette control whenever it is missing, but
  // only after the story's controls finish initializing. This effect
  // merges onto the story's own controls. It never overwrites them. The
  // args provider's effect runs once per story (deps []), so it never
  // wipes the palette control back out afterward.
  useEffect(() => {
    if (!globalState.controlInitialized || globalState.control.palette) return

    dispatch({
      type: ActionType.UpdateControl,
      value: {
        ...globalState.control,
        palette: {
          // Ladle exports this union only as strings; its state is typed by an enum it keeps
          // private, holding the same values.
          type: 'select' as GlobalState['control'][string]['type'],
          name: 'Brand palette',
          options: PALETTE_NAMES,
          defaultValue: DEFAULT_PALETTE,
          value: DEFAULT_PALETTE,
          description: 'Tenant brand palette applied via the production applyPalette',
        },
      },
    })
  }, [globalState.control, globalState.controlInitialized, dispatch])

  const palette =
    PALETTES[globalState.control.palette?.value ?? DEFAULT_PALETTE] ?? NO_BRAND_PALETTE

  // This repaints the wrapper when the chosen palette or the resolved
  // theme changes. applyPalette resets the managed variables before it
  // applies new ones. So switching back to the default restores the
  // built-in palette on its own.
  useEffect(() => {
    if (wrapper) applyPalette(wrapper, palette, theme)
  }, [wrapper, palette, theme])

  // The story's own page takes the theme's background, so a dark story scrolled past its first
  // screen, or framed at a fixed width, never shows the light page behind it.
  useEffect(() => {
    if (!wrapper) return

    const page = wrapper.ownerDocument
    const background = getComputedStyle(wrapper).backgroundColor

    page.documentElement.style.backgroundColor = background
    page.body.style.backgroundColor = background

    return () => {
      page.documentElement.style.backgroundColor = ''
      page.body.style.backgroundColor = ''
    }
  }, [wrapper, palette, theme])

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
            ref={setWrapper}
            className={clsx(
              WIDGET_SCOPE_CLASS,
              theme,
              'min-h-screen bg-background text-foreground',
              !isWidget && 'p-4 md:p-12',
            )}
          >
            <StoryDevice element={wrapper}>
              <BrandPaletteContext.Provider value={palette}>
                {children}
              </BrandPaletteContext.Provider>
            </StoryDevice>
          </main>
        </Providers>
      </MemoryRouter>
    </I18nextProvider>
  )
}

/**
 * At a fixed story width Ladle renders the story into an iframe from this same script, so
 * `window` and its media queries are still the outer page's, and a phone-sized story laid out as a
 * desktop. Every width question in the app goes through react-responsive (`config/responsive.ts`),
 * which answers from this context's size instead when one is given: the story's own window.
 */
function StoryDevice({ element, children }: { element: HTMLElement | null; children: ReactNode }) {
  const [device, setDevice] = useState<{ width: number; height: number }>()

  useLayoutEffect(() => {
    const frame = element?.ownerDocument.defaultView

    if (!frame || frame === window) {
      setDevice(undefined)

      return
    }

    const measure = () => setDevice({ width: frame.innerWidth, height: frame.innerHeight })

    measure()
    frame.addEventListener('resize', measure)

    return () => frame.removeEventListener('resize', measure)
  }, [element])

  return <ResponsiveContext.Provider value={device}>{children}</ResponsiveContext.Provider>
}
