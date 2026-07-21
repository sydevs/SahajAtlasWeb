import { useLayoutEffect, useMemo, type ReactNode, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'

import { clientQuery } from '@/config/api'
import { applyPalette, type PaletteRoles } from '@/config/theme/palette'
import { getThemeRoot, setThemeRoot, stopSystemWatch, useTheme } from '@/hooks/use-theme'

type BrandThemeProps = {
  // The widget's own service record supplies the fallback palette; its key is
  // also BrandTheme's query key, so it shares AppRouter's `['client']` fetch.
  apiKey?: string | null
  // Per-embed palette from the widget's color props; wins over the client record.
  palette?: PaletteRoles
  // The widget wrapper to scope theming to; absent standalone (root stays <html>).
  rootRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

// Resolves the active brand palette (per-embed prop ?? client record ?? built-in
// default, per role) and paints it onto the theme root as CSS custom properties.
//
// It renders *above* the Suspense boundary so the prop palette themes the
// loading fallback immediately; the client record (color1/2/3 → primary /
// secondary / background) merges in once its query resolves. Re-applies the
// mode-aware DEFAULT/foreground whenever the theme flips light↔dark.
export function BrandTheme({ apiKey, palette, rootRef, children }: BrandThemeProps) {
  const { theme } = useTheme()

  const { data: client } = useQuery({
    ...clientQuery(apiKey),
    enabled: !!apiKey,
  })

  const resolved = useMemo<PaletteRoles>(
    () => ({
      primary: palette?.primary ?? client?.color1,
      secondary: palette?.secondary ?? client?.color2,
      background: palette?.background ?? client?.color3,
    }),
    [
      palette?.primary,
      palette?.secondary,
      palette?.background,
      client?.color1,
      client?.color2,
      client?.color3,
    ],
  )

  // useLayoutEffect runs before the browser paints, so the palette (and the
  // wrapper as the theme root) are in place for the first frame — no flash.
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return

    // Adopt the widget wrapper as the theme root (null → stays <html>), then
    // paint the resolved palette onto it. Mode is read from the root's own class
    // rather than `theme`: on the widget's first paint the `theme` snapshot can
    // still reflect <html> (before setThemeRoot adopts the wrapper), which would
    // paint a dark wrapper in light tones. `theme` stays in the deps to re-run
    // this on a light↔dark toggle.
    setThemeRoot(rootRef?.current ?? null)
    const root = getThemeRoot()

    applyPalette(root, resolved, root.classList.contains('dark') ? 'dark' : 'light')
  }, [resolved, theme, rootRef])

  // Release the theme root when this widget unmounts so a torn-down embed stops
  // owning the module-level root (and its detached wrapper can be GC'd), and stop
  // the system-theme watcher so no matchMedia listener fires post-teardown. Assumes
  // one widget per page; a second concurrent embed would share these singletons.
  useLayoutEffect(
    () => () => {
      setThemeRoot(null)
      stopSystemWatch()
    },
    [],
  )

  return <>{children}</>
}
