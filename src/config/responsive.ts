import { useEffect, useState } from 'react'
import { useMediaQuery } from 'react-responsive'

const breakpoints = {
  xs: '480px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
}

type BreakpointKey = keyof typeof breakpoints

export function useBreakpoint<K extends BreakpointKey>(breakpointKey: K) {
  const bool = useMediaQuery({
    query: `(min-width: ${breakpoints[breakpointKey]})`,
  })
  const capitalizedKey = breakpointKey[0].toUpperCase() + breakpointKey.substring(1)

  type Key = `is${Capitalize<K>}`

  return {
    [`is${capitalizedKey}`]: bool,
  } as Record<Key, boolean>
}

/**
 * Debounced desktop (≥md) check. The drawer direction (left ≥md / bottom below)
 * remounts the drawer wrapper on the md crossing — vaul `direction` isn't
 * hot-swappable — so a viewport resting near 768px would otherwise thrash-remount.
 * This commits the new value only after the raw breakpoint holds for `delayMs`.
 */
export function useIsDesktop(delayMs = 200): boolean {
  const { isMd } = useBreakpoint('md')
  const [stable, setStable] = useState(isMd)

  useEffect(() => {
    const timer = setTimeout(() => setStable(isMd), delayMs)

    return () => clearTimeout(timer)
  }, [isMd, delayMs])

  return stable
}
