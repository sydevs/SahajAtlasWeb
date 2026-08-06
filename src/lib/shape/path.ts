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
 * Nest a child (an event id, or a slug) under a parent route. The inverse of
 * `parentOf`: `childRoute('/india/pune', 507)` → `/india/pune/507`. Region events
 * use this so navigating to an event keeps the region ancestry in the URL (an
 * event's own `webPath` is flat / often null), rather than composing the path inline.
 */
export const childRoute = (parentPath: string, child: string | number): string =>
  `${parentPath}/${child}`

/**
 * A server-provided route (`webPath`) is only trusted as a same-origin route if
 * it's a site-relative path: a leading `/` that isn't protocol-relative (`//host`).
 * Rejects `javascript:`, `https:`, `//evil`, etc. so a hostile/misconfigured CMS
 * `webPath` can never reach an `<a href>` — the widget builds a safe `/slug`·`/id`
 * fallback instead. Returns `undefined` for anything else.
 *
 * `/\evil.com` is rejected alongside `//evil.com`: browsers normalise a leading
 * backslash to a slash, so the standalone BrowserRouter build would render
 * `<a href="/\evil.com">` and Chrome would resolve it to `https://evil.com` on a
 * middle-click or "copy link address". Inert under the embedded HashRouter, but the
 * guard is one character and this string can reach an href.
 */
export const safePath = (path: string | null | undefined): string | undefined =>
  path && path.startsWith('/') && !/^[/\\]/.test(path.slice(1)) ? path : undefined

/**
 * True when `pathname` already is the canonical `target`, ignoring percent-
 * encoding. The address bar stores non-ASCII slugs encoded (`/li%C3%A8ge`) while
 * `webPath` is decoded (`/liège`), so a raw `!==` would loop the canonicalize
 * redirect forever on accented slugs.
 */
export const isCanonicalPath = (pathname: string, target: string): boolean =>
  safeDecode(pathname) === target

/**
 * The distance-ranked search route, optionally centred on a point. Owns the
 * `?center=lng,lat` wire format together with `parseCenter` below (its inverse) and
 * the filter serializers, so producers never hand-roll it.
 */
export const searchPath = (center?: [number, number]): string =>
  center ? `/search?center=${center[0]},${center[1]}` : '/search'

/**
 * Decode a `?center=lng,lat` value to `[longitude, latitude]`, or `undefined` when
 * it's absent or not two finite numbers IN RANGE — so a malformed hand-typed value
 * falls back to the map centre rather than feeding NaNs into Mapbox. The inverse of
 * `searchPath`'s encoding, kept beside it: SearchView (framing + distance ranking)
 * and the SearchView story (deriving the seeded query key) both read it, and a third
 * private copy is how the two would silently disagree.
 *
 * The range check matters as much as the finite one: Mapbox's `LngLat` throws outside
 * ±90 latitude, and this value reaches `flyTo` straight from the URL — so `?center=0,1000`
 * would take the whole widget down to the error boundary inside somebody else's page.
 */
export const parseCenter = (value: string | null): [number, number] | undefined => {
  if (!value) return undefined
  const [longitude, latitude] = value.split(',').map(Number)

  return Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
    ? [longitude, latitude]
    : undefined
}

/**
 * The part of a search URL that decides WHAT the results query asks for — everything
 * except `?q`.
 *
 * SearchView's results boundary resets on this (issue #89). It can't reset on the whole
 * query string: the geocoder mirrors every keystroke into `?q`, so a failing query would
 * be retried once per character typed. And it can't reset on the pathname, which is what
 * the drawer boundary already keys on — every re-search and filter change moves only the
 * query string, so without a reset a single failure would pin its error over every later
 * attempt, turning a transient failure into a permanent dead end.
 *
 * `?q` is safe to drop because nothing downstream reads it: it pre-fills the field's text
 * and suppresses the IP prompt, and neither is part of the events query.
 */
export const listResetKey = (params: URLSearchParams): string => {
  const rest = new URLSearchParams(params)

  rest.delete('q')
  rest.sort()

  return rest.toString()
}

/**
 * The searched country's ISO alpha-2 code (`?cc=IS`) — written by the geocoder field
 * and the accepted IP suggestion, read by `useCountrySite` to offer that country's own
 * website when it lists no programs (issue #82). Named here, beside `searchPath`, so
 * the writers and the reader can't drift on the param.
 *
 * Part of the *searched location*, not preserved state: `preserveSearchState`
 * (views/shared.tsx) rebuilds from an empty base, so a new search replaces it and a
 * previous country never leaks into the next search.
 */
export const SEARCH_COUNTRY_PARAM = 'cc'

/**
 * The calendar route, optionally pre-scoped to a region (`?region=<slug>`) — owns the
 * wire format together with the region filter codec so producers (the RegionView entry
 * button) never hand-roll it.
 */
export const calendarPath = (regionSlug?: string): string =>
  regionSlug ? `/calendar?region=${encodeURIComponent(regionSlug)}` : '/calendar'

/** What an incoming pathname resolves to, keyed off its terminal segment. */
export type ResolvedPath = { kind: 'region'; slug: string } | { kind: 'event'; id: number } | null

/**
 * Resolve a pathname by its **terminal segment only**: an all-digits tail is an
 * event id; any other tail is a (globally unique) region slug. Depth-independent,
 * so every nested shape and the legacy flat URLs resolve identically. Returns null
 * for the root (no region/event segment) so the caller can fall back to the home view.
 *
 * Unlike `resolveStack`, this has no `RESERVED_SLUGS` carve-out — `resolvePath('/search')`
 * resolves to a (non-existent) region slug `'search'`, not the search view. That's fine
 * today because every caller passes an already-derived entity path (e.g. `useEventFromPath`'s
 * `eventPath`), never a bare top-level route — but don't reuse this on a raw pathname that
 * might be `/search`, `/register`, or `/share` without adding the same guard.
 */
export const resolvePath = (pathname: string): ResolvedPath => {
  const segments = pathname.split('/').filter(Boolean)
  const terminal = segments.at(-1)

  if (!terminal) return null
  if (/^\d+$/.test(terminal)) return { kind: 'event', id: Number(terminal) }

  return { kind: 'region', slug: safeDecode(terminal) }
}

/**
 * Words that are never a region slug. `search` / `calendar` / `filters` / `register` /
 * `share` / `online` are our own routed views (a CMS region slug can never silently shadow them
 * — the guard); `preview` is the live-preview boot route (issue #40 — captured in
 * `main.tsx`, carries no drawer of its own); `events` / `areas` / `regions` / `venues`
 * are legacy URL prefixes that carry no drawer of their own. Kept lowercase; matched
 * case-insensitively.
 */
export const RESERVED_SLUGS = new Set([
  'search',
  'calendar',
  'filters',
  'register',
  'share',
  'online',
  'preview',
  'events',
  'areas',
  'regions',
  'venues',
])

/** One open drawer, derived from a path prefix. The DrawerStack renders one per entry. */
export type StackEntry =
  | { kind: 'search'; path: string }
  | { kind: 'calendar'; path: string }
  | { kind: 'filters'; path: string }
  | { kind: 'region'; slug: string; path: string }
  | { kind: 'event'; id: number; path: string }
  | { kind: 'register'; eventPath: string; path: string }
  | { kind: 'share'; eventPath: string; path: string }
  | { kind: 'online'; regionSlug: string; path: string }

/**
 * The full ancestor chain for a pathname — one entry per meaningful segment, in
 * order — so the drawer stack is a pure function of the URL. `/india/pune/507`
 * → [region india, region pune, event 507]; `/…/507/register` appends a register
 * entry over that event. Each entry's `path` is the site-relative route to it
 * (encoded as in the address bar); region slugs are decoded for querying. Legacy
 * prefixes (`events`, `areas`, …) resolve no drawer, so `/events/507` is just the
 * event — matching resolvePath's terminal rule but for every ancestor. CountriesView is
 * always the implicit base, so `/` yields an empty chain.
 */
export const resolveStack = (pathname: string): StackEntry[] => {
  const segments = pathname.split('/').filter(Boolean)
  const entries: StackEntry[] = []

  segments.forEach((segment, i) => {
    const path = `/${segments.slice(0, i + 1).join('/')}`
    const parentPath = i === 0 ? '/' : `/${segments.slice(0, i).join('/')}`
    const word = segment.toLowerCase()

    if (word === 'search') entries.push({ kind: 'search', path })
    else if (word === 'calendar') entries.push({ kind: 'calendar', path })
    else if (word === 'filters') entries.push({ kind: 'filters', path })
    else if (word === 'register') entries.push({ kind: 'register', eventPath: parentPath, path })
    else if (word === 'share') entries.push({ kind: 'share', eventPath: parentPath, path })
    else if (word === 'online')
      entries.push({ kind: 'online', regionSlug: safeDecode(segments[i - 1] ?? ''), path })
    else if (RESERVED_SLUGS.has(word))
      return // legacy prefix (events/areas/…) — no drawer
    else if (/^\d+$/.test(segment)) entries.push({ kind: 'event', id: Number(segment), path })
    else entries.push({ kind: 'region', slug: safeDecode(segment), path })
  })

  return entries
}

/**
 * The nearest region in a dead URL's ancestry that still exists — where to send someone
 * whose link 404'd (issue #89).
 *
 * Drops the LAST entry before walking, because that entry *is* what failed: the top of the
 * stack is the view that threw. Then takes the first ancestor whose slug the caller's set
 * confirms. One rule covers every shape with no special-casing — it steps over the
 * `register`/`share` segment, over a dead event id, and over a renamed venue slug the
 * region tree no longer carries.
 *
 * Deliberately NOT `parentOf`: the parent of `<event>/register` is the event path, which
 * 404s identically, so `parentOf` would offer a second dead link as the escape from the
 * first. Returns the ancestor's SLUG; the caller resolves it to a canonical `webPath`,
 * since the URL prefix may be a legacy chain.
 *
 * Pure and total — an unparseable path yields `undefined`, never a throw. It runs inside an
 * error fallback, where a throw would blank the widget on someone else's page.
 */
export const nearestKnownRegion = (pathname: string, known: Set<string>): string | undefined => {
  try {
    const ancestors = resolveStack(pathname).slice(0, -1)

    for (let i = ancestors.length - 1; i >= 0; i -= 1) {
      const entry = ancestors[i]

      if (entry?.kind === 'region' && known.has(entry.slug)) return entry.slug
    }

    return undefined
  } catch {
    return undefined
  }
}
