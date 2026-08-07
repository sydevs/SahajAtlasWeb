/**
 * Who owns the URL fragment on the page the widget is embedded in — and what the
 * widget is allowed to do about it (issue #92).
 *
 * The embedded widget routes off `window.location.hash` under the `!` basename, so
 * `#!/gb/london` is a widget route. But the fragment belongs to the HOST page first:
 * a WordPress URL arrives carrying `#respond` or `#comment-123` all the time, and
 * react-router's hash history reads that as a location outside the basename,
 * `stripBasename` returns `null`, and the widget renders NOTHING. The old mount guard
 * declined to touch a foreign hash — correct instinct, blank result.
 *
 * So the decision is three-way, not two, and it is a pure function of the hash:
 *
 * - **ours** (`#!/gb/london`) — a route the visitor already navigated to or deep-linked.
 *   It wins over `base-path`, and nothing is written.
 * - **free** (no hash, `#`, `#!`, `#!/`, or an `#!…` whose path `safePath` rejects) — the
 *   fragment is unclaimed or is ours to normalise, so the widget takes it and boots at
 *   `base-path`. This function only says WHAT to write; `claimFragment` (`Widget.tsx`)
 *   writes it, and why that write must be a `replaceState` is documented there.
 * - **foreign** (`#respond`) — the host's anchor. The widget leaves the URL completely
 *   alone (their on-load scroll, and anything of theirs that reads `location.hash` later,
 *   both keep working) and routes in memory instead, booting at `base-path`.
 *
 * Splitting the decision out here is what makes it testable: `hash.test.ts` covers the
 * hostile inputs (`#!//evil.example`, `#!javascript:…`) in the node lane, with no DOM.
 */
import { safePath } from './path'

/**
 * The hash basename the widget owns. Everything after `#!` is a widget route; a hash
 * that doesn't start with it belongs to the host page.
 */
export const HASH_BASE = '!'

export type MountRoute = {
  /** `hash` — the widget owns the fragment; `memory` — the host does, so route off-URL. */
  router: 'hash' | 'memory'
  /** The route to boot at. Informational for a deep link (hash history re-reads it). */
  path: string
  /** A hash to `replaceState` before mounting, or `undefined` to leave the URL untouched. */
  write?: string
}

/**
 * Decide where the widget mounts and whether it may claim the URL fragment.
 *
 * `hash` is `window.location.hash` (leading `#` optional); `basePath` is the host's
 * `base-path` attribute, which is untrusted and goes through `safePath` — so
 * `base-path="//evil.example"` boots at `/` rather than reaching react-router.
 */
export const mountRoute = (
  hash: string | null | undefined,
  basePath?: string | null,
): MountRoute => {
  // Both spellings of our own basename, because the widget writes one and react-router
  // writes the other. The boot write below produces `#!/gb/london`; `Router` normalises
  // the basename `!` to `/!` and `joinPaths` puts a slash in front, so the moment the
  // visitor clicks anything the address bar reads `#/!/gb/london`. Recognising only the
  // first spelling meant every reload of a page the visitor had navigated to was read as
  // the HOST's anchor — the exact failure this module exists to prevent, aimed at
  // ourselves. `hash.router.test.tsx` pins both directions against the real router.
  const raw = (hash ?? '').replace(/^#/, '').replace(/^\//, '')
  // One reading of `base-path`, so the route the widget mounts at and the hash written to
  // the address bar can never answer "where does this boot" differently.
  const base = safePath(basePath)
  const path = base ?? '/'

  // A host anchor. Not ours to overwrite — route in memory and never touch the URL.
  if (raw !== '' && !raw.startsWith(HASH_BASE)) return { router: 'memory', path }

  // Ours (or unclaimed). A real route already in the hash wins over `base-path`: the
  // visitor navigated there, or deep-linked to it. `safePath` is what makes `#!//evil.example`
  // and `#!javascript:…` NOT count as one — they're normalised away to `base-path` below.
  const route = raw === '' ? undefined : safePath(raw.slice(HASH_BASE.length))

  if (route && route !== '/') return { router: 'hash', path: route }

  // Free: claim it — unless the fragment already routes where we'd send it. `#!` and `#!/`
  // both mean the root, so with no `base-path` to apply there is nothing to write and no
  // reason to rewrite the visitor's URL. (Every OTHER already-correct hash returned above,
  // as a route.)
  const settled = path === '/' && (raw === HASH_BASE || raw === `${HASH_BASE}/`)

  return { router: 'hash', path, write: settled ? undefined : `#${HASH_BASE}${base ?? ''}` }
}
