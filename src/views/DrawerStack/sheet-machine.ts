import type { Ladder, SheetOpening, Stop } from '@/views/DrawerStack/sheet-ladder'

import { and, assign, createActor, setup } from 'xstate'

import { WIDE_SNAP, capStop } from '@/config/responsive'
import { sameRoute } from '@/lib/shape'
import { FIT_SNAP, PEEK_SNAP, OPEN_SNAP, resolveStop } from '@/views/DrawerStack/sheet-ladder'

export type SheetEvent =
  /**
   * The top view (or the class on it) changed: open at that view's own height. `view` names it,
   * the same key `LOCATION_SETTLED` carries.
   */
  | { type: 'VIEW_CHANGED'; view: string; opening: SheetOpening; openSnap: string }
  /** A new `?center` was searched. */
  | { type: 'SEARCH_MOVED' }
  /** The header's collapse/expand control. */
  | { type: 'TOGGLE'; openSnap: string }
  /** vaul reported a stop, as shown (capped) — see `onVaulSnap`. */
  | { type: 'VAUL_SNAP'; next: Stop; ladder: Ladder; cap: number | null; openSnap: string }
  /** "Show N classes": the results the filters close onto should open tall. */
  | { type: 'SHOW_RESULTS'; tall: boolean }
  /** `dismiss` with no step back: the root view collapses to its peek. */
  | { type: 'COLLAPSE' }
  /** `dismiss` is stepping back through history from the entry `key`, to `to`. */
  | { type: 'STEP_BACK'; key: string; to: string }
  /** The router committed a location (layout phase, so a rewrite lands before paint). */
  | { type: 'LOCATION'; key: string; pathname: string; search: string; state: unknown }
  /** A location committed, onto the view `view` names. */
  | { type: 'LOCATION_SETTLED'; view: string }

type SheetContext = {
  snap: Stop
  /** The view the sheet last opened for, so a settle can tell whether its move changed one. */
  view: string | null
  /** The step back in flight: the entry it left, and where it is due to land. */
  landing: { key: string; to: string } | null
}

/**
 * What vaul's echo means for the logical stop. vaul echoes every `activeSnapPoint` it is handed
 * back through its setter, so an echo of the stop already shown changes nothing: taken literally
 * it would swap the `FIT_SNAP` token for whatever it resolved to that render, and the sheet would
 * stop following its content. The fit's px maps back to the token for the same reason.
 *
 * A short window caps the pixel stops (`shortSheetCap`) only on the way to vaul, so `snap` keeps
 * naming the logical stop. A capped stop stands for every stop above the cap: the sheet stays
 * where it was if that caps to here, and otherwise opens at its usual open stop.
 */
export function onVaulSnap(
  snap: Stop,
  { next, ladder, cap, openSnap }: Omit<Extract<SheetEvent, { type: 'VAUL_SNAP' }>, 'type'>,
): Stop {
  const vaulSnap = resolveStop(ladder, snap)

  if (cap !== null && next === `${cap}px` && !ladder.points.includes(next)) {
    return capStop(vaulSnap, cap) === next ? snap : openSnap
  }
  if (next === vaulSnap) return snap

  return ladder.fitSnap !== null && next === ladder.fitSnap ? FIT_SNAP : next
}

/**
 * The phone sheet's stop and the two intents a dismissal leaves for the next location: "open the
 * results tall" (`results`) and "rewrite the landed entry" (`landing`). Each intent is consumed or
 * dropped by the next navigation, so neither can outlive the move it was armed for.
 */
export const sheetMachine = setup({
  types: {
    context: {} as SheetContext,
    events: {} as SheetEvent,
  },
  actions: {
    /** Replaces the landed entry with `to`; DrawerStack supplies the navigation. */
    rewriteLanding: (_, _params: { to: string; state: unknown }) => {},
  },
  guards: {
    landedElsewhere: ({ context, event }) =>
      event.type === 'LOCATION' && context.landing !== null && context.landing.key !== event.key,
    // On the path it said, under a different query than the one it left behind.
    queryMoved: ({ context: { landing }, event }) =>
      event.type === 'LOCATION' &&
      landing !== null &&
      event.pathname === landing.to.split('?')[0] &&
      !sameRoute(`${event.pathname}${event.search}`, landing.to),
    tall: ({ event }) => event.type === 'SHOW_RESULTS' && event.tall,
    sameView: ({ context, event }) =>
      event.type === 'LOCATION_SETTLED' && event.view === context.view,
  },
}).createMachine({
  id: 'sheet',
  type: 'parallel',
  context: { snap: OPEN_SNAP, view: null, landing: null },
  on: {
    // A new searched place lifts the sheet out of its peek, so results are never fetched into a
    // sheet the visitor cannot see. A view change does not cover it: the geolocate control lives on
    // the MAP, so "drag the sheet down to see the map, then press locate" re-searches `/search`
    // without changing the view. `?center` moves only on a real re-search, and raising ONLY out of
    // the peek leaves a sheet the visitor pulled tall exactly where they put it.
    SEARCH_MOVED: {
      actions: assign({
        snap: ({ context }) => (context.snap === PEEK_SNAP ? OPEN_SNAP : context.snap),
      }),
    },
    TOGGLE: {
      actions: assign({
        snap: ({ context, event }) => (context.snap === PEEK_SNAP ? event.openSnap : PEEK_SNAP),
      }),
    },
    VAUL_SNAP: {
      actions: assign({ snap: ({ context, event }) => onVaulSnap(context.snap, event) }),
    },
  },
  states: {
    // The view-change reset and the collapse live in this region, not at the root: each also
    // settles the intent, and one transition per event keeps their order fixed.
    results: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            // Keyed on the view KIND, so switching the calendar between month/week/list keeps it
            // tall, and sent only when the top view changes, so it never fights a drag within one.
            VIEW_CHANGED: {
              actions: assign({
                snap: ({ event }) => (event.opening === 'tall' ? WIDE_SNAP : event.openSnap),
                view: ({ event }) => event.view,
              }),
            },
            COLLAPSE: { actions: assign({ snap: PEEK_SNAP }) },
            SHOW_RESULTS: { guard: 'tall', target: 'tallNext' },
          },
        },
        tallNext: {
          on: {
            VIEW_CHANGED: {
              target: 'idle',
              actions: assign({ snap: WIDE_SNAP, view: ({ event }) => event.view }),
            },
            // No step back means no next view to open tall: the root collapses instead.
            COLLAPSE: { target: 'idle', actions: assign({ snap: PEEK_SNAP }) },
            SHOW_RESULTS: [{ guard: 'tall' }, { target: 'idle' }],
            // A move that changed no view has spent the intent too. One that did is the view
            // change's to spend, whichever of the two arrives first.
            LOCATION_SETTLED: { guard: 'sameView', target: 'idle' },
          },
        },
      },
    },
    // A step back lands where it said: closing the filters onto the search they covered keeps the
    // answers tapped since, by rewriting the landed entry's query rather than restoring the old one.
    landing: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            STEP_BACK: {
              target: 'pending',
              actions: assign({ landing: ({ event }) => ({ key: event.key, to: event.to }) }),
            },
          },
        },
        pending: {
          on: {
            STEP_BACK: {
              target: 'pending',
              reenter: true,
              actions: assign({ landing: ({ event }) => ({ key: event.key, to: event.to }) }),
            },
            LOCATION: [
              {
                guard: and(['landedElsewhere', 'queryMoved']),
                target: 'idle',
                actions: [
                  {
                    type: 'rewriteLanding',
                    params: ({ context, event }) => ({
                      to: context.landing?.to ?? '',
                      state: event.state,
                    }),
                  },
                  assign({ landing: null }),
                ],
              },
              { guard: 'landedElsewhere', target: 'idle', actions: assign({ landing: null }) },
            ],
          },
        },
      },
    },
  },
})

/**
 * One sheet's actor, for `useSyncExternalStore`.
 *
 * It is never stopped. The machine holds no timer and invokes no child, so a live actor owns
 * nothing but its subscribers and goes with the component that created it. Stopping it on
 * unmount is what StrictMode's simulated unmount would then trip over: a stopped actor ignores
 * every later event, and the remounted sheet would stop answering.
 */
export function createSheetStore(rewriteLanding: (to: string, state: unknown) => void) {
  return createActor(
    sheetMachine.provide({
      actions: { rewriteLanding: (_, { to, state }) => rewriteLanding(to, state) },
    }),
  ).start()
}
