import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Where `announceEmbed` is called from is the guarantee, not a detail — so it is pinned here the
 * way `href.test.ts` pins the app's three JSX anchors (#153).
 *
 * The readiness marker must never go up over a widget that failed to boot: SahajCloud loads the
 * host page itself and treats the marker as evidence the embed works, so a false one gets a broken
 * page adopted as a region's canonical URL. The obvious home for the call is the widget's own root
 * — and it is wrong there, for a reason no reading of that file would reveal. **A boundary's
 * `componentDidCatch` runs in the commit's layout phase and a parent's `useEffect` in the passive
 * phase after it**, so a synchronous first-render failure (a loader URL with no `key` throws inside
 * `AppShell`) lets the boundary clear a marker not yet published, and the root's effect then
 * publishes one over the "could not be loaded" screen, with nothing left to take it down.
 *
 * Called from `AppShell` — below the app error boundary and below the Suspense read of the client
 * record — three properties hold at once, none of them by luck: the marker cannot precede a
 * successful boot, it is never published over the loading state, and pressing "Try again"
 * remounts the component and re-publishes what the boundary took down.
 *
 * A pure spec cannot see any of that, and a browser check is a one-off. This asserts the shape
 * that keeps it true.
 */
const SRC = new URL('..', import.meta.url).pathname

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []

    return [path]
  })
}

/** The module that declares it — its own signature is not a call site. */
const DEFINITION = 'lib/embed-announce.ts'

describe('the announce call site', () => {
  const callers = sourceFiles(SRC)
    .filter((path) => /\bannounceEmbed\s*\(/.test(readFileSync(path, 'utf8')))
    .map((path) => path.slice(SRC.length))
    .filter((path) => path !== DEFINITION)
    .sort()

  it('is App.tsx and nowhere else', () => {
    expect(callers).toEqual(['App.tsx'])
  })

  /**
   * The specific relocation, asserted from the other end: `Widget.tsx` is above the app error
   * boundary, so an effect there is the placement this test exists to prevent. It may still hand
   * the routing DOWN — that is `mountDecision`'s answer travelling to the component that attests it.
   */
  it('is not the widget root, which sits above the boundary', () => {
    const widget = readFileSync(join(SRC, 'Widget.tsx'), 'utf8')

    expect(widget).not.toMatch(/\bannounceEmbed\s*\(/)
    expect(widget).toMatch(/routing=\{attested\}/)
  })

  // The other half of the pair: the two boundaries that replace the whole widget take the marker
  // back down. A drawer boundary deliberately does not — see the comment in App.tsx.
  it('clears the marker from both widget-level boundaries', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8')

    expect(app.match(/clearReadiness/g) ?? []).toHaveLength(3)
  })
})
