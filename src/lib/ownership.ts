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
 * Pure: no DOM, no React, no singleton — the element is anything with `isConnected`, so every
 * cell of the table is reachable from the node lane (`ownership.test.ts`).
 */
import { assign, setup } from 'xstate'

/** What the machine reads off an element: whether it still stands in the document. */
export type Ownable = { readonly isConnected: boolean }

type OwnershipEvent<E extends Ownable> =
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

type OwnershipContext<E extends Ownable> = { owner: E | null }

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
 * The machine, typed to the element it counts. `release` and `refuse` are no-ops here; the caller
 * supplies them with `.provide()`.
 *
 * ⚠ **An action that throws stops the actor**, and a stopped ownership actor accepts no element
 * again: the widget would never render for the rest of the page's life.
 */
export function createOwnershipMachine<E extends Ownable>() {
  return setup({
    types: {
      context: {} as OwnershipContext<E>,
      events: {} as OwnershipEvent<E>,
    },
    actions: {
      release: () => {},
      refuse: () => {},
      claim: assign({
        owner: ({ context, event }) => (event.type === 'connect' ? event.element : context.owner),
      }),
      forget: assign({ owner: null }),
    },
    guards: {
      isOwner: ({ context, event }) => event.element === context.owner,
      // `isConnected` is what separates a REPLACEMENT from a second embed: a departed owner
      // yields the page, a live one refuses the arrival.
      ownerStands: ({ context }) => context.owner?.isConnected === true,
      keyChanged: ({ event }) => event.type === 'connect' && event.keyChanged,
    },
    delays: { grace: TEARDOWN_GRACE_MS },
  }).createMachine({
    id: 'ownership',
    context: { owner: null },
    initial: 'vacant',
    states: {
      vacant: {
        on: { connect: { target: 'owned', actions: 'claim' } },
      },
      owned: {
        on: {
          connect: [
            { guard: 'isOwner' },
            // ⚠ So a replacement has to disconnect before its successor connects —
            // `replaceWith` and a framework re-render both do. Insert first and the arrival is
            // refused while the old owner still stands, never gets a second `connectedCallback`,
            // and the old owner's teardown then leaves the page with no widget at all.
            { guard: 'ownerStands', actions: 'refuse' },
            { actions: 'claim' },
          ],
          disconnect: { guard: 'isOwner', target: 'grace' },
        },
      },
      // Deferred, not immediate — see TEARDOWN_GRACE_MS. A duplicate that was refused while the
      // owner lived stays refused either way: it gets no second `connectedCallback`.
      grace: {
        after: { grace: { target: 'vacant', actions: ['forget', 'release'] } },
        on: {
          connect: [
            { guard: 'isOwner', target: 'owned' },
            // A host router that re-renders its page replaces the element on every Back/Forward
            // press, so what the cache has to survive is a NEW element and not only a returning
            // one. A different key must still release — `TEARDOWN_GRACE_MS` says why — and
            // asking only for a new element keeps a plain reconnect out of a key comparison
            // `AtlasBoot` may not have answered yet.
            // shortcut: only `['client', apiKey]` is key-scoped, so a release is the whole cache;
            // key every factory in `config/api/index.ts` if two keys reach one page.
            { guard: 'keyChanged', target: 'owned', actions: ['release', 'claim'] },
            { target: 'owned', actions: 'claim' },
          ],
        },
      },
    },
  })
}
