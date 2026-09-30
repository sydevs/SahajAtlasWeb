import { useLayoutEffect, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'

import { clientQuery } from '@/config/api'
import { applyPalette, type PaletteRoles } from '@/config/theme/palette'
import { getThemeRoot, stopSystemWatch, useTheme } from '@/hooks/use-theme'

type BrandThemeProps = {
  // The widget's own service record supplies the fallback palette.
  // Its key is also `BrandTheme`'s query key, so it shares AppRouter's `['client']` fetch.
  apiKey?: string | null
  // This is the per-embed palette from the widget's color props. It wins over the client record.
  palette?: PaletteRoles
  children: ReactNode
}

// This resolves the active brand palette, per role: the per-embed prop, then the client record, then the built-in default.
// It paints that palette onto the theme root as CSS custom properties: the widget wrapper, which `Widget.tsx` publishes before this renders, or `<html>` standalone.
//
// This renders ABOVE the Suspense boundary, so the prop palette themes the loading fallback immediately.
// The client record, `color1`, `color2`, `color3` mapped to primary, secondary, contrast, merges in once its query resolves.
// This re-applies the mode-aware default and foreground whenever the theme flips between light and dark.
export function BrandTheme({ apiKey, palette, children }: BrandThemeProps) {
  const { theme } = useTheme()

  const { data: client } = useQuery({
    ...clientQuery(apiKey),
    enabled: !!apiKey,
  })

  const resolved = useMemo<PaletteRoles>(
    () => ({
      primary: palette?.primary ?? client?.color1,
      secondary: palette?.secondary ?? client?.color2,
      // `color3` now themes the `contrast` role.
      // Background is no longer tenant-wired. It uses the fixed `globals.css` default on every component.
      contrast: palette?.contrast ?? client?.color3,
    }),
    [
      palette?.primary,
      palette?.secondary,
      palette?.contrast,
      client?.color1,
      client?.color2,
      client?.color3,
    ],
  )

  // `useLayoutEffect` runs before the browser paints, so the palette is in place for the first frame, with no flash.
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return

    applyPalette(getThemeRoot(), resolved, theme)
  }, [resolved, theme])

  // This stops the system-theme watcher when this widget unmounts, so no `matchMedia` listener fires after teardown.
  // ⚠ It must not release the theme root too. The wrapper's callback ref does that, and this component sits inside
  // `StrictMode`, whose simulated unmount would clear a root nothing then publishes again.
  // This assumes one widget per page. A second concurrent embed would share these singletons.
  useLayoutEffect(() => () => stopSystemWatch(), [])

  return <>{children}</>
}
