/**
 * Which `<sahaj-atlas>` owns the page, as a state machine.
 *
 * A widget owns page-global singletons — the API key (`config/api/auth`), the boot config
 * (`config/embed`), the theme root, and BrandTheme's system-theme watcher — so a second element
 * would run on the first one's key and steal its theme root, in silence. Exactly one runs, and the
 * rule is enforced where the thing being counted actually lives: the element's own lifecycle
 * callbacks, not a React render pass. `Widget.tsx` feeds this machine those callbacks and carries
 * out the two effects it names, `release` and `refuse`.
 *
 * ⚠ **Hand-rolled rather than XState, because this module is in both eager graphs.** `Widget.tsx`
 * reaches it before anything renders, so a library here is ~12 KiB gzipped on every host page
 * (`scripts/check-bundle-size.mjs`). Three states, one timer and no invoked actor fit a table; the
 * two machines behind the lazy interface need real regions and invoked actors, and keep XState.
 *
 * Pure: no DOM, no React, no singleton — the element is anything with `isConnected`, so every
 * cell of the table is reachable from the node lane (`ownership.test.ts`).
 */

/** What the machine reads off an element: whether it still stands in the document. */
export type Ownable = { readonly isConnected: boolean }

export type OwnershipState = 'vacant' | 'owned' | 'grace'

export type OwnershipEvent<E extends Ownable> =
  | {
      type: 'connect'
      element: E
      /**
       * Whether the key in force differs from the one the loader just configured. Consulted only
       * when a DIFFERENT element arrives inside the grace window — see `grace` below.
       */
      keyChanged: boolean
    }
  | { type: 'disconnect'; element: E }

/** The two effects the caller owns, named by the table. */
export type OwnershipEffects = {
  /** Gives up the page-global state the departed owner held. */
  release: () => void
  /** Tells the page that an arrival will not render. */
  refuse: () => void
}

/**
 * How long a removed element has to come back before its page-global state is released.
 *
 * **Moving a node is a disconnect followed by a connect**, and page builders do it:
 * Elementor's "Optimized Markup" relocates elements after load. Releasing the API key
 * and clearing the query cache the instant an element is removed therefore meant a
 * builder rearranging its canvas wiped an hour of warm cache (`WHOLESALE_GC_TIME`)
 * mid-session, and refetched the whole feed.
 *
 * `Element.moveBefore()` — which preserves state across a move — does not help twice
 * over: it has no Safari support, and it is the *host* who would have to call it.
 *
 * So the teardown is deferred rather than removed. The reason it exists stays
 * unchanged and still load-bearing: an element re-added with a DIFFERENT `key` must
 * not authenticate as the first, and only `['client', apiKey]` carries the credential
 * in its key — `['regions']`, `['geojson']`, the titles sliver, and every event stay
 * key-agnostic, so a re-add under another key would read the first key's responses out
 * of the cache.
 */
export const TEARDOWN_GRACE_MS = 1_000

/**
 * The page's owner, and the three states it passes through.
 *
 * ⚠ **Neither effect may throw.** `send` carries out the table's effects inline, so a throw
 * leaves the state half-applied and propagates into a lifecycle callback — and an element whose
 * `connectedCallback` threw never renders for the rest of the page's life.
 */
export function createOwnership<E extends Ownable>({ release, refuse }: OwnershipEffects) {
  let state: OwnershipState = 'vacant'
  let owner: E | null = null
  let grace: ReturnType<typeof setTimeout> | undefined

  // Cancelled on the way OUT of `grace`, re-armed on the way in, so a returning element gets a
  // whole window and an event the table ignores keeps the deadline it already had.
  const enterGrace = () => {
    state = 'grace'
    grace = setTimeout(() => {
      state = 'vacant'
      owner = null
      release()
    }, TEARDOWN_GRACE_MS)
  }
  const leaveGrace = () => {
    clearTimeout(grace)
    grace = undefined
  }

  return {
    getState: () => state,
    getOwner: () => owner,

    send(event: OwnershipEvent<E>) {
      if (state === 'vacant') {
        if (event.type === 'connect') {
          state = 'owned'
          owner = event.element
        }

        return
      }

      if (state === 'owned') {
        if (event.type === 'disconnect') {
          if (event.element === owner) enterGrace()

          return
        }
        if (event.element === owner) return
        // `isConnected` is what separates a REPLACEMENT from a second embed: a departed owner
        // yields the page, a live one refuses the arrival.
        //
        // ⚠ So a replacement has to disconnect before its successor connects — `replaceWith` and
        // a framework re-render both do. Insert first and the arrival is refused while the old
        // owner still stands, never gets a second `connectedCallback`, and the old owner's
        // teardown then leaves the page with no widget at all.
        if (owner?.isConnected === true) return refuse()

        owner = event.element

        return
      }

      // grace. A duplicate that was refused while the owner lived stays refused either way: it
      // gets no second `connectedCallback`.
      if (event.type !== 'connect') return

      leaveGrace()
      state = 'owned'

      if (event.element === owner) return

      // A host router that re-renders its page replaces the element on every Back/Forward
      // press, so what the cache has to survive is a NEW element and not only a returning
      // one. A different key must still release — `TEARDOWN_GRACE_MS` says why — and
      // asking only for a new element keeps a plain reconnect out of a key comparison
      // `AtlasBoot` may not have answered yet.
      // shortcut: only `['client', apiKey]` is key-scoped, so a release is the whole cache;
      // key every factory in `config/api/index.ts` if two keys reach one page.
      if (event.keyChanged) release()

      owner = event.element
    },
  }
}

export type Ownership<E extends Ownable> = ReturnType<typeof createOwnership<E>>
