/**
 * Route helpers for the hierarchical URL scheme. Canonical paths are computed by
 * the backend now — `webPath` on regions/events and in the geojson feed — so the
 * widget no longer builds them from breadcrumb slugs. It only resolves an incoming
 * pathname to a region/event (terminal segment) and derives a parent path for
 * back-navigation.
 */

/** Decode a URL segment, tolerating a malformed `%` escape (returns it unchanged). */
const safeDecode = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * Parent of a nested path — drop the last segment. `undefined` for a single-segment
 * (top-level) path. Works for both a region path (→ its parent region) and an event
 * path (→ its region page, dropping the numeric id).
 */
export const parentOf = (path: string): string | undefined => {
  const segments = path.split('/').filter(Boolean)

  return segments.length > 1 ? `/${segments.slice(0, -1).join('/')}` : undefined
}

/**
 * True when `pathname` already is the canonical `target`, ignoring percent-
 * encoding. The address bar stores non-ASCII slugs encoded (`/li%C3%A8ge`) while
 * `webPath` is decoded (`/liège`), so a raw `!==` would loop the canonicalize
 * redirect forever on accented slugs.
 */
export const isCanonicalPath = (pathname: string, target: string): boolean =>
  safeDecode(pathname) === target

/** What an incoming pathname resolves to, keyed off its terminal segment. */
export type ResolvedPath = { kind: 'region'; slug: string } | { kind: 'event'; id: number } | null

/**
 * Resolve a pathname by its **terminal segment only**: an all-digits tail is an
 * event id; any other tail is a (globally unique) region slug. Depth-independent,
 * so every nested shape and the legacy flat URLs resolve identically. Returns null
 * for the root (no region/event segment) so the caller can fall back to the home view.
 */
export const resolvePath = (pathname: string): ResolvedPath => {
  const segments = pathname.split('/').filter(Boolean)
  const terminal = segments.at(-1)

  if (!terminal) return null
  if (/^\d+$/.test(terminal)) return { kind: 'event', id: Number(terminal) }

  return { kind: 'region', slug: safeDecode(terminal) }
}
