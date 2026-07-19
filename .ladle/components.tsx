import type { GlobalProvider } from '@ladle/react'

import { useEffect, useRef, useState } from 'react'
import { ThemeState, useLadleContext } from '@ladle/react'
import { MemoryRouter } from 'react-router'
import { I18nextProvider } from 'react-i18next'

import storyI18n from './i18n'

import Providers from '@/providers'
import { applyTheme, useTheme } from '@/hooks/use-theme'
import { applyPalette, type PaletteRoles } from '@/config/theme/palette'

import '@/styles/globals.css'

// Brand presets sampled from real tenants (issue #16). Selecting one runs the
// production applyPalette on the story wrapper, so Ladle previews exactly what
// an embed renders. "Default" applies no override (built-in teal/orange).
const PALETTES: Record<string, PaletteRoles> = {
  'palette: wemeditate.com': {},
  'palette: shrimataji.org': { primary: '#64032E', secondary: '#A11F0C', background: '#F0ECE2' },
  'palette: sahajayoga.org': { primary: '#5D6F44', secondary: '#D47B2C' },
}

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
// Brand palette: a fixed switcher applies a tenant preset to the story wrapper
// via the production applyPalette, re-applying when the palette or the resolved
// light/dark theme changes.
export const Provider: GlobalProvider = ({ children }) => {
  const { globalState } = useLadleContext()
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

  const [palette, setPalette] = useState('palette: wemeditate.com')
  const wrapperRef = useRef<HTMLElement>(null)
  const { theme } = useTheme()

  // Re-paint the wrapper when the chosen palette or the resolved theme changes.
  // applyPalette resets the managed vars before applying, so switching back to
  // Default restores the built-in palette on its own.
  useEffect(() => {
    const el = wrapperRef.current

    if (!el) return

    applyPalette(el, PALETTES[palette], theme)
  }, [palette, theme])

  return (
    <I18nextProvider i18n={storyI18n}>
      <MemoryRouter>
        <Providers>
          <main ref={wrapperRef} className="min-h-screen bg-background p-6 text-foreground">
            <select
              aria-label="Brand palette"
              style={{ position: 'fixed', top: 8, right: 8, zIndex: 50 }}
              value={palette}
              onChange={(event) => setPalette(event.target.value)}
            >
              {Object.keys(PALETTES).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {children}
          </main>
        </Providers>
      </MemoryRouter>
    </I18nextProvider>
  )
}
