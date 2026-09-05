import { useLayoutEffect, useMemo, type ReactNode, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'

import { clientQuery } from '@/config/api'
import { applyPalette, type PaletteRoles } from '@/config/theme/palette'
import { getThemeRoot, setThemeRoot, stopSystemWatch, useTheme } from '@/hooks/use-theme'

type BrandThemeProps = {
  // The widget's own service record supplies the fallback palette.
  // Its key is also `BrandTheme`'s query key, so it shares AppRouter's `['client']` fetch.
  apiKey?: string | null
  // This is the per-embed palette from the widget's color props. It wins over the client record.
  palette?: PaletteRoles
  // This is the widget wrapper to scope theming to. It is absent in standalone mode, and the root stays `<html>`.
  rootRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

// This resolves the active brand palette, per role: the per-embed prop, then the client record, then the built-in default.
// It paints that palette onto the theme root as CSS custom properties.
//
// This renders ABOVE the Suspense boundary, so the prop palette themes the loading fallback immediately.
// The client record, `color1`, `color2`, `color3` mapped to primary, secondary, contrast, merges in once its query resolves.
// This re-applies the mode-aware default and foreground whenever the theme flips between light and dark.
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

  // `useLayoutEffect` runs before the browser paints.
  // So the palette, and the wrapper as the theme root, are in place for the first frame, with no flash.
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return

    // This adopts the widget wrapper as the theme root. A null value keeps `<html>` as the root.
    // It then paints the resolved palette onto that root.
    // This reads mode from the root's own class, not from `theme`.
    // On the widget's first paint, the `theme` snapshot can still reflect `<html>`, before `setThemeRoot` adopts the wrapper.
    // Reading `theme` there would paint a dark wrapper in light tones.
    // `theme` still stays in the dependency list, to re-run this effect on a light-to-dark toggle.
    setThemeRoot(rootRef?.current ?? null)
    const root = getThemeRoot()

    applyPalette(root, resolved, root.classList.contains('dark') ? 'dark' : 'light')
  }, [resolved, theme, rootRef])

  // This releases the theme root when this widget unmounts.
  // So a torn-down embed stops owning the module-level root, and its detached wrapper can be garbage-collected.
  // This also stops the system-theme watcher, so no `matchMedia` listener fires after teardown.
  // This assumes one widget per page. A second concurrent embed would share these singletons.
  useLayoutEffect(
    () => () => {
      setThemeRoot(null)
      stopSystemWatch()
    },
    [],
  )

  return <>{children}</>
}
