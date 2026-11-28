import type { LocateEvent } from './locate-machine'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createActor, fromCallback } from 'xstate'

import { locateMachine, SETTLE_MS } from './locate-machine'

const FIX = { coords: { latitude: 50.088, longitude: 14.42 } } as GeolocationPosition
const LATE = { coords: { latitude: 51.5, longitude: -0.12 } } as GeolocationPosition

/** An actor whose `ask` records each request's answer channel, for the test to answer. */
const start = (ask?: (sendBack: (event: LocateEvent) => void) => void) => {
  const asked: ((event: LocateEvent) => void)[] = []
  const actor = createActor(
    locateMachine.provide({
      actors: {
        ask: fromCallback<LocateEvent>(({ sendBack }) => {
          asked.push(sendBack)
          ask?.(sendBack)
        }),
      },
    }),
  ).start()

  return { actor, asked, phase: () => actor.getSnapshot().value }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the locate machine', () => {
  it('goes idle → locating → found, keeping the position', () => {
    const { actor, asked, phase } = start()

    expect(phase()).toBe('idle')
    actor.send({ type: 'request' })
    expect(phase()).toBe('locating')
    asked[0]({ type: 'answer', position: FIX })
    expect(phase()).toBe('found')
    expect(actor.getSnapshot().context.position).toBe(FIX)
  })

  it('fails on a refusal, and a fresh request asks again', () => {
    const { actor, asked, phase } = start()

    actor.send({ type: 'request' })
    asked[0]({ type: 'refuse' })
    expect(phase()).toBe('failed')
    actor.send({ type: 'request' })
    expect(phase()).toBe('locating')
    expect(asked).toHaveLength(2)
  })

  // Two controls pressed together must not start two permission prompts.
  it('ignores a request while one is out', () => {
    const { actor, asked } = start()

    actor.send({ type: 'request' })
    actor.send({ type: 'request' })
    expect(asked).toHaveLength(1)
  })

  it('asks again from found', () => {
    const { actor, asked, phase } = start()

    actor.send({ type: 'request' })
    asked[0]({ type: 'answer', position: FIX })
    actor.send({ type: 'request' })
    expect(phase()).toBe('locating')
    expect(asked).toHaveLength(2)
  })

  it('fails a request nothing answers, at the backstop', () => {
    vi.useFakeTimers()

    const { actor, phase } = start()

    actor.send({ type: 'request' })
    vi.advanceTimersByTime(SETTLE_MS - 1)
    expect(phase()).toBe('locating')
    vi.advanceTimersByTime(1)
    expect(phase()).toBe('failed')
  })

  // The stopped `ask` is what keeps one request's answer from settling the next.
  it('drops an answer from a request the backstop already failed', () => {
    vi.useFakeTimers()

    const { actor, asked, phase } = start()

    actor.send({ type: 'request' })
    vi.advanceTimersByTime(SETTLE_MS)
    actor.send({ type: 'request' })
    asked[0]({ type: 'refuse' })
    expect(phase()).toBe('locating')
    asked[1]({ type: 'answer', position: FIX })
    expect(phase()).toBe('found')
  })

  it('takes a fix nobody waited for over a reported failure', () => {
    const { actor, asked, phase } = start()

    actor.send({ type: 'request' })
    asked[0]({ type: 'refuse' })
    actor.send({ type: 'fix', position: LATE })
    expect(phase()).toBe('found')
    expect(actor.getSnapshot().context.position).toBe(LATE)
  })

  it('fails, keeping the error, when the source throws', () => {
    const error = new Error('no control')
    const { actor, phase } = start(() => {
      throw error
    })

    actor.send({ type: 'request' })
    expect(phase()).toBe('failed')
    expect(actor.getSnapshot().context.error).toBe(error)
  })

  it('clears an earlier error when a new request starts', () => {
    let fail = true
    const { actor, asked } = start(() => {
      if (fail) throw new Error('no control')
    })

    actor.send({ type: 'request' })
    fail = false
    actor.send({ type: 'request' })
    asked[1]({ type: 'refuse' })
    expect(actor.getSnapshot().context.error).toBeUndefined()
  })
})
