import type { GlobalProvider } from '@ladle/react'

import { useEffect, useRef } from 'react'
import { ActionType, ThemeState, useLadleContext } from '@ladle/react'
import { MemoryRouter } from 'react-router'
import { I18nextProvider } from 'react-i18next'

import storyI18n from './i18n'

import Providers from '@/providers'
import { applyTheme, useTheme } from '@/hooks/use-theme'
import { applyPalette, type PaletteRoles } from '@/config/theme/palette'

import '@/styles/globals.css'

// Brand presets sampled from real tenants (issue #16). Selecting one runs the
// production applyPalette on the story wrapper, so Ladle previews exactly what
// an embed renders. The first (default) applies no override (built-in teal/orange).
const PALETTES: Record<string, PaletteRoles> = {
  'wemeditate.com': {},
  'shrimataji.org': { primary: '#64032E', secondary: '#A11F0C', background: '#F0ECE2' },
  'sahajayoga.org': { primary: '#5D6F44', secondary: '#D47B2C' },
}

const PALETTE_NAMES = Object.keys(PALETTES)
const DEFAULT_PALETTE = PALETTE_NAMES[0]

// Global decorator for every story.
//
// Mirrors src/providers.tsx (NextUI + React Query + Helmet) and supplies the two
// things the app entry normally provides but stories otherwise lack:
//   1. a Router — NextUIProvider and many components call react-router hooks
//      (Link / useNavigate / useSearchParams); MemoryRouter keeps the preview
//      URL clean.
//   2. i18n with bundled resources (see ./i18n) wired through I18nextProvider.
//
// The widget injects its CSS via JS in production, so stories must import
// globals.css explicitly.
//
// Theme: Ladle's own light/dark/auto toggle drives the whole canvas. We map its
// active theme onto the root `light`/`dark` class — through the same applyTheme
// seam useTheme uses — that Tailwind (darkMode: 'class') and useTheme all read,
// so flipping Ladle's toggle re-themes every story, including the Mapbox basemap
// (which follows useTheme). `auto` resolves against the OS preference and tracks
// it live. The wrapper carries `bg-background` so the whole preview area follows
// the app theme — including when a story's own <ThemeSwitch> toggles it, not just
// Ladle's toolbar (Ladle's own chrome stays on Ladle's theme, which is expected).
//
// Brand palette: a native Ladle control (registered on every story, see below)
// applies a tenant preset to the story wrapper via the production applyPalette,
// re-applying when the palette or the resolved light/dark theme changes.
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

  // The view stories are full-view drawer pages (they own the whole canvas via the
  // ViewHarness), so they drop the usual component-preview padding and fill their
  // width-xsmall frame edge to edge. Every other tier keeps the padded gutter.
  const isView = globalState.story?.startsWith('views--')

  // The brand palette is a first-class Ladle control (in the Controls panel) rather
  // than a bespoke <select>. Ladle wipes control state on each story change and the
  // args provider only re-seeds a story's OWN args, so re-assert ours whenever it's
  // missing — but only once the story's controls have initialized, so we merge onto
  // (never clobber) the story's own controls. The args provider's effect runs once
  // per story (deps []), so it never wipes the palette back out afterwards.
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

  // Re-paint the wrapper when the chosen palette or the resolved theme changes.
  // applyPalette resets the managed vars before applying, so switching back to
  // the default restores the built-in palette on its own.
  useEffect(() => {
    const el = wrapperRef.current

    if (!el) return

    applyPalette(el, PALETTES[palette] ?? {}, theme)
  }, [palette, theme])

  return (
    <I18nextProvider i18n={storyI18n}>
      <MemoryRouter>
        <Providers>
          <main
            ref={wrapperRef}
            className={
              isView
                ? 'min-h-screen bg-background text-foreground'
                : 'min-h-screen bg-background p-6 text-foreground'
            }
          >
            {children}
          </main>
        </Providers>
      </MemoryRouter>
    </I18nextProvider>
  )
}
