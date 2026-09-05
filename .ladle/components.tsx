import type { GlobalProvider } from '@ladle/react'

import { useEffect, useRef } from 'react'
import { ActionType, ThemeState, useLadleContext } from '@ladle/react'
import { MemoryRouter } from 'react-router'
import clsx from 'clsx'
import { I18nextProvider } from 'react-i18next'

import storyI18n from './i18n'

import Providers from '@/providers'
import { applyTheme, useTheme } from '@/hooks/use-theme'
import { applyPalette, type PaletteRoles } from '@/config/theme/palette'
import { WIDGET_SCOPE_CLASS } from '@/lib/scope'

import '@/styles/globals.css'
// Stories mount components without App. So this file also registers the
// self-hosted faces (#91). Without this line, every preview renders in the
// fallback system sans font.
import '@/styles/fonts'

// Ladle has no widget wrapper. <html> is the theme root here, exactly as in
// the standalone build. So <html> must carry the style scope class, or no
// rule in the sheet matches anything (issue #91). This runs at module
// scope, not inside an effect. An effect runs after the first render, so
// every story would paint unstyled for one frame.
//
// Warning: this alone is not enough. The gap stays invisible until you hit
// it. Ladle's viewport control (`?width=…`) re-renders the story inside an
// iframe. This side effect ran against the document that loaded the
// module, not the document the story lands in. The iframe got the
// stylesheet but no `.sy-atlas` class, so every rule matched nothing and
// every component rendered with browser defaults. The wrapper below also
// carries the class. That is what makes it work in any document.
if (typeof document !== 'undefined') {
  document.documentElement.classList.add(WIDGET_SCOPE_CLASS)
}

// Brand presets sampled from real tenants (issue #16). Selecting one runs
// the production applyPalette on the story wrapper. So Ladle previews
// exactly what an embed renders. The first preset is the default. It
// applies no override, so it uses the built-in teal and orange colors.
const PALETTES: Record<string, PaletteRoles> = {
  'wemeditate.com': {},
  'shrimataji.org': { primary: '#64032E', secondary: '#A11F0C', background: '#F0ECE2' },
  'sahajayoga.org': { primary: '#5D6F44', secondary: '#D47B2C' },
}

const PALETTE_NAMES = Object.keys(PALETTES)
const DEFAULT_PALETTE = PALETTE_NAMES[0]

// Global decorator for every story.
//
// Mirrors src/providers.tsx: React Query and Helmet, with no UI-library
// provider (Radix primitives are headless and need none). This decorator
// supplies two things the app entry normally provides, that a story
// otherwise lacks:
//   1. a Router. Radix components are headless, but many components still
//      call react-router hooks (Link / useNavigate / useSearchParams).
//      MemoryRouter keeps the preview URL clean.
//   2. i18n with bundled resources (see ./i18n), wired through
//      I18nextProvider.
//
// In production, the widget injects its CSS through JS. So each story must
// import globals.css directly.
//
// Theme: Ladle's own light/dark/auto toggle drives the whole canvas. This
// decorator maps the active theme onto the root `light`/`dark` class,
// through the same applyTheme seam useTheme uses. Tailwind (darkMode:
// 'class') and useTheme both read that class. So flipping Ladle's toggle
// re-themes every story, including the Mapbox basemap, which follows
// useTheme. `auto` resolves against the OS preference and tracks it live.
// The wrapper carries `bg-background`, so the whole preview area follows
// the app theme, including when a story's own <ThemeSwitch> toggles it, not
// only Ladle's toolbar. Ladle's own chrome stays on Ladle's theme. That is
// expected.
//
// Brand palette: a native Ladle control, registered on every story (see
// below), applies a tenant preset to the story wrapper through the
// production applyPalette. It re-applies whenever the palette or the
// resolved light/dark theme changes.
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

  // View stories are full-view drawer pages. Each one owns the whole canvas
  // through the ViewHarness. So view stories drop the usual
  // component-preview padding and fill their width-xsmall frame edge to
  // edge. Every other tier keeps the padded gutter.
  const isView = globalState.story?.startsWith('views--')

  // The brand palette is a first-class Ladle control, in the Controls
  // panel, not a custom <select>. Ladle wipes control state on each story
  // change. The args provider only re-seeds a story's own args. So this
  // effect re-adds the palette control whenever it is missing, but only
  // after the story's controls finish initializing. This merges onto the
  // story's own controls. It never overwrites them. The args provider's
  // effect runs once per story (deps []), so it never wipes the palette
  // control back out afterward.
  useEffect(() => {
    if (!globalState.controlInitialized || globalState.control.palette) return

    dispatch({
      type: ActionType.UpdateControl,
      value: {
        ...globalState.control,
        palette: {
          type: 'select',
          name: 'Brand palette',
          options: PALETTE_NAMES,
          defaultValue: DEFAULT_PALETTE,
          value: DEFAULT_PALETTE,
          description: 'Tenant brand palette applied via the production applyPalette',
        },
      },
    })
  }, [globalState.control, globalState.controlInitialized, dispatch])

  const palette = globalState.control.palette?.value ?? DEFAULT_PALETTE

  // Repaint the wrapper when the chosen palette or the resolved theme
  // changes. applyPalette resets the managed vars before it applies new
  // ones. So switching back to the default restores the built-in palette
  // on its own.
  useEffect(() => {
    const el = wrapperRef.current

    if (!el) return

    applyPalette(el, PALETTES[palette] ?? {}, theme)
  }, [palette, theme])

  return (
    <I18nextProvider i18n={storyI18n}>
      <MemoryRouter>
        <Providers>
          {/* The scope class sits on both this wrapper and <html>, on purpose.
              See the note at the top of this file: in viewport mode, the story
              renders into an iframe that the module-scope class never reaches.
              An ancestor inside the tree is the only thing that travels with
              it. Having the class in both places is harmless: `:where()` adds
              no specificity, and the inherited-property block sets the same
              values at either level. */}
          <main
            ref={wrapperRef}
            className={clsx(
              WIDGET_SCOPE_CLASS,
              'min-h-screen bg-background text-foreground',
              !isView && 'p-6',
            )}
          >
            {children}
          </main>
        </Providers>
      </MemoryRouter>
    </I18nextProvider>
  )
}
