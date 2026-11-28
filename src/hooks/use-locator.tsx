import type { ReactNode } from 'react'
import type { LocatePhase } from '@/lib/locate-machine'

import { createContext, useContext, useState } from 'react'
import { createActor, fromCallback, waitFor } from 'xstate'

import { useActorSelector } from '@/hooks/use-actor-selector'
import { LOCATE_POSITION_OPTIONS } from '@/lib/geolocation'
import { locateMachine } from '@/lib/locate-machine'

/** How a position request is answered. */
export type PositionAnswer = {
  resolve: (position: GeolocationPosition) => void
  reject: () => void
}

/** One way to ask for the visitor's position. */
export type PositionSource = (answer: PositionAnswer) => void

/**
 * The visitor's position, for every control that asks: the map's "find my location" and the
 * filters' Near me. While the map is mounted its GeolocateControl is the source, so every
 * request draws the blue dot; without a map the browser is asked directly.
 *
 * The request's phase is shared (`lib/locate-machine.ts`), so every control shows the same
 * one; each control still ACTS only on the requests it made.
 */
export type Locator = ReturnType<typeof createLocator>

type LocatorApi = {
  /**
   * One request at a time: an ask while one is out shares its answer, so two controls never
   * start two permission prompts. Rejects on refusal, timeout, or a page with no geolocation.
   */
  request: () => Promise<GeolocationPosition>
  /** A fix nobody asked for — Mapbox answering after the request had failed. */
  fix: (position: GeolocationPosition) => void
  /** The map registers its control while mounted, and `null` on the way out. */
  setSource: (source: PositionSource | null) => void
  getPhase: () => LocatePhase
  /** The id of the request now out, or of the last one (`LocateContext.requestId`). */
  getRequestId: () => number
}

const devicePosition: PositionSource = ({ resolve, reject }) => {
  if (!navigator.geolocation) return reject()

  navigator.geolocation.getCurrentPosition(resolve, () => reject(), LOCATE_POSITION_OPTIONS)
}

export function createLocator() {
  let source: PositionSource | null = null

  const actor = createActor(
    locateMachine.provide({
      actors: {
        ask: fromCallback(({ sendBack }) => {
          ;(source ?? devicePosition)({
            resolve: (position) => sendBack({ type: 'answer', position }),
            reject: () => sendBack({ type: 'refuse' }),
          })
        }),
      },
    }),
  ).start()

  const phase = () => actor.getSnapshot().value as LocatePhase

  const locator: LocatorApi = {
    request() {
      // The machine ignores `request` while one is out, so a second ask waits on the first.
      actor.send({ type: 'request' })

      return waitFor(actor, (snapshot) => !snapshot.matches('locating')).then((snapshot) =>
        snapshot.matches('found') && snapshot.context.position
          ? snapshot.context.position
          : Promise.reject(snapshot.context.error),
      )
    },
    fix(position) {
      actor.send({ type: 'fix', position })
    },
    setSource(next) {
      source = next
    },
    getPhase: phase,
    getRequestId: () => actor.getSnapshot().context.requestId,
  }

  return { ...locator, actor }
}

const LocatorContext = createContext<Locator | null>(null)

// Outside a provider (a story, a spec), one locator of their own, made on first use.
let fallback: Locator | null = null

/**
 * One locator per interface, so the map and the filters beside it share it, and it goes when
 * the interface does — a compact embed closing its dialog takes its pending request with it.
 */
export function LocatorProvider({ children }: { children: ReactNode }) {
  const [locator] = useState(createLocator)

  return <LocatorContext.Provider value={locator}>{children}</LocatorContext.Provider>
}

export const useLocator = (): Locator =>
  useContext(LocatorContext) ?? (fallback ??= createLocator())

/** The shared request's phase, and which request it belongs to. */
export function useLocateState(): { phase: LocatePhase; requestId: number } {
  const { actor } = useLocator()
  const phase = useActorSelector(actor, (snapshot) => snapshot.value as LocatePhase, 'idle')
  const requestId = useActorSelector(actor, (snapshot) => snapshot.context.requestId, 0)

  return { phase, requestId }
}
