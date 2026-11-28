import type { LocateState } from './use-locate'

import { create } from 'zustand'

type FindMeState = {
  /** Asks for the visitor's position while a map is mounted to answer; `null` without one. */
  locate: (() => void) | null
  state: LocateState
  /** The find-me button, wherever it renders, so the failure dialog can hand focus back to it. */
  button: HTMLButtonElement | null
}

/**
 * "Find my location" as the map publishes it, so its button can render outside the map — in the
 * inline toolbar — as well as in the map's corner (`MapControls`). The map owns the request and its
 * failure dialog (`use-locate.ts`); the button only reads and calls.
 */
export const useFindMe = create<FindMeState>(() => ({ locate: null, state: 'idle', button: null }))
