import { assign, fromCallback, setup } from 'xstate'

import { LOCATE_POSITION_OPTIONS } from './geolocation'

/** Where the visitor's position request stands, for every control that asks. */
export type LocatePhase = 'idle' | 'locating' | 'found' | 'failed'

export type LocateEvent =
  | { type: 'request' }
  | { type: 'answer'; position: GeolocationPosition }
  | { type: 'refuse' }
  /** A fix nobody is waiting for: Mapbox's answer after the request had already failed. */
  | { type: 'fix'; position: GeolocationPosition }

type LocateContext = {
  /**
   * Which request the phase belongs to, counted from 1. A control remembers the id it asked
   * under, so a refusal shows only where it was asked for — never another control's, and never
   * one from before this control mounted.
   */
  requestId: number
  position: GeolocationPosition | null
  /** What a throwing source threw; a refusal or the backstop leaves it undefined. */
  error: unknown
}

/**
 * A backstop past the request's own timeout. Mapbox answers nothing once its control has left
 * the map, and a request that never settled would leave every control waiting for good.
 */
export const SETTLE_MS = (LOCATE_POSITION_OPTIONS.timeout ?? 30_000) + 5_000

/**
 * One position request at a time, shared by the map's "find my location" and the filters' Near
 * me (`hooks/use-locator.tsx`). `request` while `locating` is ignored, so two controls never
 * start two permission prompts. Leaving `locating` stops the `ask` actor, so an answer from a
 * request the backstop already failed is dropped instead of settling the next one.
 *
 * `ask` is a placeholder: the locator provides the real one, which reads whichever source is
 * registered when the request starts.
 */
export const locateMachine = setup({
  types: {} as { context: LocateContext; events: LocateEvent },
  actors: { ask: fromCallback<LocateEvent>(() => {}) },
  delays: { settle: SETTLE_MS },
  actions: {
    keepPosition: assign({
      position: ({ event }) =>
        event.type === 'answer' || event.type === 'fix' ? event.position : null,
    }),
  },
}).createMachine({
  id: 'locate',
  initial: 'idle',
  context: { requestId: 0, position: null, error: undefined },
  // An answer that arrives after a reported failure wins: the map and list are right, and an
  // error on top of them would be false.
  on: { fix: { target: '.found', actions: 'keepPosition' } },
  states: {
    idle: { on: { request: 'locating' } },
    locating: {
      entry: assign({ requestId: ({ context }) => context.requestId + 1, error: undefined }),
      invoke: {
        src: 'ask',
        onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error }) },
      },
      after: { settle: 'failed' },
      on: {
        answer: { target: 'found', actions: 'keepPosition' },
        refuse: 'failed',
      },
    },
    found: { on: { request: 'locating' } },
    failed: { on: { request: 'locating' } },
  },
})
