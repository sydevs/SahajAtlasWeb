// originally written by @imoaazahmed; reworked to observe a configurable root
// class so a single theme signal drives Tailwind, the Radix tokens, and the Mapbox basemap.

import { useEffect, useSyncExternalStore } from 'react'

/**
 * ⚠ The key is namespaced, and that is a **bug fix** rather than branding (#156).
 *
 * It used to be the bare string `theme`, written into the HOST page's `localStorage` — so a site
 * that stores its own light/dark preference under that name had it read and silently overwritten
 * by an embedded widget. `docs/embedding.md` has admitted this in a table for months.
 *
 * `LEGACY_THEME_KEY` is read once when the namespaced key is absent, so nobody loses the setting
 * they already chose. It is never written, so the old key stops being touched from the first load
 * after this ships and a host's own value is left alone from then on.
 */
const LEGACY_THEME_KEY = 'theme'

const ThemeProps = {
  key: 'atlas.theme',
  light: 'light',
  dark: 'dark',
  auto: 'auto',
} as const

// The *resolved* theme written to the root class (what Tailwind/tokens/Mapbox read).
type Theme = typeof ThemeProps.light | typeof ThemeProps.dark
// The user's *preference*: a resolved theme, or 'auto' (follow the system).
export type ThemePreference = Theme | typeof ThemeProps.auto

// The theme root's class is the single source of truth: Tailwind
// (darkMode: 'class'), the semantic tokens, and the Mapbox basemap
// (MAP_STYLES[theme]) all key off
// it. Standalone, the root is the host page's <html>. Embedded, the widget
// scopes it to its own wrapper (via setThemeRoot) so it never mutates the host
// page's <html> — its brand vars and theme class stay inside the widget.
let themeRoot: HTMLElement | null = null

// The element the theme machinery reads/writes — the single source of truth for
// "what is the theme root", shared by useTheme and BrandTheme's palette paint.
export const getThemeRoot = (): HTMLElement => themeRoot ?? document.documentElement

// Subscriptions that must re-observe when the root element changes (see
// subscribe). A Set so each live useTheme caller re-attaches its observer.
const rootListeners = new Set<() => void>()

// Point the theme machinery at a specific element (the widget wrapper), or pass
// null to fall back to <html>. Notifies live subscribers so they re-observe the
// new root and re-read the current theme.
export const setThemeRoot = (el: HTMLElement | null) => {
  if (themeRoot === el) return
  themeRoot = el
  rootListeners.forEach((notify) => notify())
}

// useTheme observes the root's class so every consumer reacts to a change made
// anywhere — the settings menu, the Ladle theme toggle, etc. The observer follows
// the active root: if setThemeRoot swaps it, each subscription re-attaches.
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

// Stories and unit tests render via renderToStaticMarkup (no DOM); default light.
const getServerSnapshot = (): Theme => ThemeProps.light

// The single seam for writing the theme to the root class — used by the preference
// machinery, initTheme, and the Ladle decorator so the mechanism never drifts.
export const applyTheme = (theme: Theme) => {
  const root = getThemeRoot()

  root.classList.remove(ThemeProps.light, ThemeProps.dark)
  root.classList.add(theme)
  // NB: deliberately does NOT write the style scope class (issue #91). It belongs on the
  // same element as the theme class, so putting it here looks right — but `getThemeRoot()`
  // falls back to `document.documentElement`, and BrandTheme releases the module-level
  // root on unmount. With two embeds on a page the survivor's next theme write would then
  // stamp `sy-atlas` onto the HOST page's <html> and apply the entire widget stylesheet —
  // Preflight, `.container`, the lot — to their site. Each owner applies the class to an
  // element it actually owns instead: the wrapper in Widget.tsx, <html> in index.html,
  // and the Ladle decorator.
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

// While the preference is 'auto', re-apply the resolved theme whenever the system
// flips. Idempotent + guarded so it's a no-op without a DOM.
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

// Fully disengage the system-theme watcher. Called on widget teardown (BrandTheme's
// unmount, alongside releasing the theme root) so a torn-down embed leaves no
// matchMedia listener firing against a detached wrapper / the host page's <html>.
export const stopSystemWatch = () => watchSystem(false)

// ── Preference storage + signal ──────────────────────────────────────────────────

// localStorage can throw — not just be absent — in sandboxed iframes (a `sandbox`
// without `allow-same-origin`) and some privacy modes, which matters since this
// ships as an embeddable widget. Wrap reads/writes so the theme class still updates;
// the choice just isn't persisted.
const isPreference = (value: string | null): value is ThemePreference =>
  value === ThemeProps.dark || value === ThemeProps.light || value === ThemeProps.auto

const readStoredPreference = (): ThemePreference | null => {
  try {
    const stored = localStorage.getItem(ThemeProps.key)

    if (isPreference(stored)) return stored

    // One-time migration off the un-namespaced key. Read, never written — so from the first load
    // after this ships we stop touching a key that was never ours, while a viewer who had already
    // chosen a theme keeps it. A host's own unrelated `theme` value simply fails `isPreference`.
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
    // storage unavailable — ignore; the root class still reflects the choice
  }
}

// The current preference, mirrored to useThemePreference subscribers. Seeded lazily
// from storage on first read so the widget (which sets its class via getInitialTheme
// rather than initTheme) still reports the right value.
let preference: ThemePreference | null = null
const prefListeners = new Set<() => void>()

const getPreference = (): ThemePreference => {
  if (preference === null) preference = readStoredPreference() ?? ThemeProps.light

  return preference
}

// Apply a preference to the root class and (dis)engage the system watcher. Does not
// persist — startup applies without writing; setPreference persists first.
const applyPreference = (pref: ThemePreference) => {
  preference = pref
  applyTheme(resolvePreference(pref))
  watchSystem(pref === ThemeProps.auto)
}

// ── Startup helpers (used by main / Widget) ──────────────────────────────────────

// Resolve the theme to render on first paint (persisted preference, else default),
// without touching the DOM — the widget uses it to set its wrapper's initial class.
export const getInitialTheme = (defaultTheme: Theme = ThemeProps.light): Theme =>
  resolvePreference(readStoredPreference() ?? defaultTheme)

// Apply the persisted (or default) preference to the root class once at startup, and
// start watching the system when it's 'auto'. Guarded to be a no-op outside the browser.
export const initTheme = (defaultTheme: Theme = ThemeProps.light) => {
  if (typeof document === 'undefined') return

  applyPreference(readStoredPreference() ?? defaultTheme)
}

// ── Hooks ────────────────────────────────────────────────────────────────────────

// The resolved theme (light/dark) read from the root class — what the map/tokens use.
export const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return { theme }
}

// The user's preference (light/dark/auto) + setter — drives the settings menu. The
// resolved class still comes from useTheme; setting the preference persists it,
// applies the resolved theme, and (dis)engages the system watcher. Also keeps the
// watcher engaged for an 'auto' preference restored on load.
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
