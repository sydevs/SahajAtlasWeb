// @imoaazahmed originally wrote this file.
// This version reworks it to observe a configurable root class.
// So a single theme signal drives Tailwind, the Radix tokens, and the Mapbox basemap.

import { useEffect, useSyncExternalStore } from 'react'

/**
 * ⚠ This key is namespaced. That change is a **bug fix**, not branding. See #156.
 *
 * The key used to be the bare string `theme`, written into the HOST page's `localStorage`.
 * A site that stored its own light/dark preference under that name had it read and silently overwritten by an embedded widget.
 * `docs/embedding.md` has admitted this in a table for months.
 *
 * `LEGACY_THEME_KEY` is read once, when the namespaced key is absent, so nobody loses a setting they already chose.
 * This code never writes that legacy key.
 * So the old key stops being touched from the first load after this ships, and a host's own value is left alone from then on.
 */
const LEGACY_THEME_KEY = 'theme'

const ThemeProps = {
  key: 'atlas.theme',
  light: 'light',
  dark: 'dark',
  auto: 'auto',
} as const

// This is the resolved theme, written to the root class. Tailwind, the tokens, and Mapbox all read it.
type Theme = typeof ThemeProps.light | typeof ThemeProps.dark
// This is the user's preference: a resolved theme, or `'auto'` to follow the system.
export type ThemePreference = Theme | typeof ThemeProps.auto

// The theme root's class is the single source of truth.
// Tailwind, through `darkMode: 'class'`, the semantic tokens, and the Mapbox basemap, through `MAP_STYLES[theme]`, all key off it.
// In the standalone app, the root is the host page's `<html>` element.
// Embedded, the widget scopes it to its own wrapper, through `setThemeRoot`.
// So the widget never mutates the host page's `<html>` element. Its brand variables and theme class stay inside the widget.
let themeRoot: HTMLElement | null = null

// This is the element the theme machinery reads and writes.
// It is the single source of truth for "what is the theme root."
// `useTheme` and `BrandTheme`'s palette paint both share it.
export const getThemeRoot = (): HTMLElement => themeRoot ?? document.documentElement

// These are subscriptions that must re-observe when the root element changes. See `subscribe` below.
// This is a Set, so each live `useTheme` caller re-attaches its own observer.
const rootListeners = new Set<() => void>()

// This points the theme machinery at a specific element, the widget wrapper.
// Pass null to fall back to `<html>`.
// This notifies live subscribers, so they re-observe the new root and re-read the current theme.
export const setThemeRoot = (el: HTMLElement | null) => {
  if (themeRoot === el) return
  themeRoot = el
  rootListeners.forEach((notify) => notify())
}

// `useTheme` observes the root's class.
// So every consumer reacts to a change made anywhere, such as the settings menu or the Ladle theme toggle.
// The observer follows the active root.
// If `setThemeRoot` swaps that root, each subscription re-attaches.
const subscribe = (onChange: () => void) => {
  let observer: MutationObserver | null = null

  const attach = () => {
    observer?.disconnect()
    observer = new MutationObserver(onChange)
    observer.observe(getThemeRoot(), { attributes: true, attributeFilter: ['class'] })
  }

  const onRootChange = () => {
    attach()
    onChange()
  }

  rootListeners.add(onRootChange)
  attach()

  return () => {
    rootListeners.delete(onRootChange)
    observer?.disconnect()
  }
}

const getSnapshot = (): Theme =>
  getThemeRoot().classList.contains(ThemeProps.dark) ? ThemeProps.dark : ThemeProps.light

// Stories and unit tests render through `renderToStaticMarkup`, with no DOM. This defaults to light.
const getServerSnapshot = (): Theme => ThemeProps.light

// This is the single seam for writing the theme to the root class.
// The preference machinery, `initTheme`, and the Ladle decorator all use it, so the mechanism never drifts.
export const applyTheme = (theme: Theme) => {
  const root = getThemeRoot()

  root.classList.remove(ThemeProps.light, ThemeProps.dark)
  root.classList.add(theme)
  // NB: this deliberately does NOT write the style scope class. See issue #91.
  // That class belongs on the same element as the theme class, so writing it here looks right.
  // But `getThemeRoot()` falls back to `document.documentElement`, and `BrandTheme` releases the module-level root on unmount.
  // With two embeds on a page, the survivor's next theme write would then stamp `sy-atlas` onto the HOST page's `<html>` element.
  // That would apply the entire widget stylesheet, Preflight, `.container`, and everything else, to the host's own site.
  // So each owner applies the class to an element it actually owns instead.
  // Those owners are the wrapper in `Widget.tsx`, `<html>` in `index.html`, and the Ladle decorator.
}

// ── System (prefers-color-scheme) resolution + watching ──────────────────────────

const prefersDark = (): boolean => {
  try {
    return (
      typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
    )
  } catch {
    return false
  }
}

const resolvePreference = (pref: ThemePreference): Theme =>
  pref === ThemeProps.auto ? (prefersDark() ? ThemeProps.dark : ThemeProps.light) : pref

// While the preference is `'auto'`, this re-applies the resolved theme whenever the system flips.
// This function is idempotent and guarded, so it is a no-op without a DOM.
let systemMedia: MediaQueryList | null = null
let onSystemChange: (() => void) | null = null

const watchSystem = (enabled: boolean) => {
  if (typeof window === 'undefined' || !window.matchMedia) return
  if (enabled && !onSystemChange) {
    systemMedia = window.matchMedia('(prefers-color-scheme: dark)')
    onSystemChange = () => applyTheme(resolvePreference(ThemeProps.auto))
    systemMedia.addEventListener('change', onSystemChange)
  } else if (!enabled && onSystemChange) {
    systemMedia?.removeEventListener('change', onSystemChange)
    systemMedia = null
    onSystemChange = null
  }
}

// This fully disengages the system-theme watcher.
// The widget calls this on teardown, in `BrandTheme`'s unmount, alongside releasing the theme root.
// So a torn-down embed leaves no `matchMedia` listener firing against a detached wrapper or the host page's `<html>` element.
export const stopSystemWatch = () => watchSystem(false)

// ── Preference storage + signal ──────────────────────────────────────────────────

// `localStorage` can throw, not only be absent, in sandboxed iframes with a `sandbox` attribute and no `allow-same-origin`, and in some privacy modes.
// This matters because this code ships as an embeddable widget.
// This wraps every read and write, so the theme class still updates even when storage fails.
// The choice simply is not persisted in that case.
const isPreference = (value: string | null): value is ThemePreference =>
  value === ThemeProps.dark || value === ThemeProps.light || value === ThemeProps.auto

const readStoredPreference = (): ThemePreference | null => {
  try {
    const stored = localStorage.getItem(ThemeProps.key)

    if (isPreference(stored)) return stored

    // This is a one-time migration off the un-namespaced key.
    // This code reads that key, but never writes it.
    // So from the first load after this ships, the app stops touching a key that was never ours.
    // A viewer who had already chosen a theme keeps that choice.
    // A host's own unrelated `theme` value simply fails `isPreference`.
    const legacy = localStorage.getItem(LEGACY_THEME_KEY)

    return isPreference(legacy) ? legacy : null
  } catch {
    return null
  }
}

const persistPreference = (pref: ThemePreference) => {
  try {
    localStorage.setItem(ThemeProps.key, pref)
  } catch {
    // Storage is unavailable. This ignores the error. The root class still reflects the choice.
  }
}

// This holds the current preference, mirrored to `useThemePreference` subscribers.
// This seeds lazily from storage on first read.
// So the widget, which sets its class through `getInitialTheme` rather than `initTheme`, still reports the right value.
let preference: ThemePreference | null = null
const prefListeners = new Set<() => void>()

const getPreference = (): ThemePreference => {
  if (preference === null) preference = readStoredPreference() ?? ThemeProps.light

  return preference
}

// This applies a preference to the root class, and engages or disengages the system watcher.
// This does not persist the preference.
// Startup applies without writing. `setPreference` persists first instead.
const applyPreference = (pref: ThemePreference) => {
  preference = pref
  applyTheme(resolvePreference(pref))
  watchSystem(pref === ThemeProps.auto)
}

// ── Startup helpers (used by main / Widget) ──────────────────────────────────────

// This resolves the theme to render on first paint: the persisted preference, or the default.
// This never touches the DOM.
// The widget uses it to set its wrapper's initial class.
export const getInitialTheme = (defaultTheme: Theme = ThemeProps.light): Theme =>
  resolvePreference(readStoredPreference() ?? defaultTheme)

// This applies the persisted preference, or the default, to the root class once at startup.
// It starts watching the system when the preference is `'auto'`.
// This is guarded to be a no-op outside the browser.
export const initTheme = (defaultTheme: Theme = ThemeProps.light) => {
  if (typeof document === 'undefined') return

  applyPreference(readStoredPreference() ?? defaultTheme)
}

// ── Hooks ────────────────────────────────────────────────────────────────────────

// This returns the resolved theme, light or dark, read from the root class. The map and tokens use it.
export const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return { theme }
}

// This returns the user's preference, light, dark, or auto, plus a setter. It drives the settings menu.
// The resolved class still comes from `useTheme`.
// Setting the preference persists it, applies the resolved theme, and engages or disengages the system watcher.
// This also keeps the watcher engaged for an `'auto'` preference restored on load.
export const useThemePreference = () => {
  const value = useSyncExternalStore(
    (cb) => {
      prefListeners.add(cb)

      return () => prefListeners.delete(cb)
    },
    getPreference,
    () => ThemeProps.light as ThemePreference,
  )

  useEffect(() => {
    watchSystem(value === ThemeProps.auto)
  }, [value])

  const setPreference = (pref: ThemePreference) => {
    persistPreference(pref)
    applyPreference(pref)
    prefListeners.forEach((n) => n())
  }

  return { preference: value, setPreference }
}
