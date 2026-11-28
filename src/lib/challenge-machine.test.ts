import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  type ChallengeEvent,
  type ChallengeSnapshot,
  HANDSHAKE_TIMEOUT_MS,
  canSpend,
  createChallengeStore,
} from './challenge-machine'

const token = (value = 'tok-1'): ChallengeEvent => ({ type: 'token', token: value })
const ev = (type: Exclude<ChallengeEvent['type'], 'token'>) => ({ type }) as ChallengeEvent

/** Runs `events` through a fresh store and reads what the hook would publish off it. */
function after(...events: ChallengeEvent[]): ChallengeSnapshot {
  const store = createChallengeStore()

  for (const event of events) store.send(event)

  const snapshot = store.getSnapshot()

  store.stop()

  return snapshot
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the challenge table', () => {
  it.each<[string, ChallengeEvent[], ChallengeSnapshot]>([
    ['starts silent', [], { state: 'loading', token: null }],
    ['handshake', [ev('ready')], { state: 'unsolved', token: null }],
    [
      'Cloudflare asks for a click',
      [ev('ready'), ev('interactive')],
      { state: 'needsClick', token: null },
    ],
    [
      'the click window closes unsolved',
      [ev('ready'), ev('interactive'), ev('settled')],
      { state: 'unsolved', token: null },
    ],
    // The success mark stays on screen until the page says the window closed.
    [
      'solved by the click',
      [ev('ready'), ev('interactive'), token()],
      { state: 'solvedShown', token: 'tok-1' },
    ],
    [
      'solved by the click, then settled',
      [ev('ready'), ev('interactive'), token(), ev('settled')],
      { state: 'solvedCollapsed', token: 'tok-1' },
    ],
    ['solved invisibly', [ev('ready'), token()], { state: 'solvedCollapsed', token: 'tok-1' }],
    [
      'a token before the handshake still counts',
      [token()],
      { state: 'solvedCollapsed', token: 'tok-1' },
    ],
    [
      'a refreshed token replaces the old one',
      [ev('ready'), token('tok-1'), token('tok-2')],
      { state: 'solvedCollapsed', token: 'tok-2' },
    ],
    [
      'expiry drops the token without blocking',
      [ev('ready'), token(), ev('expired')],
      { state: 'unsolved', token: null },
    ],
    [
      'reset drops the spent token',
      [ev('ready'), token(), ev('reset')],
      { state: 'unsolved', token: null },
    ],
    [
      'error drops the token and blocks',
      [ev('ready'), token(), ev('error')],
      { state: 'blocked', token: null },
    ],
    [
      'blocked does not latch against a token',
      [ev('error'), token('tok-2')],
      { state: 'solvedCollapsed', token: 'tok-2' },
    ],
    [
      'blocked does not latch against a click request',
      [ev('error'), ev('interactive')],
      { state: 'needsClick', token: null },
    ],
    [
      'a reset while blocked changes nothing',
      [ev('error'), ev('reset')],
      { state: 'blocked', token: null },
    ],
    [
      'a reset before the handshake changes nothing',
      [ev('reset')],
      { state: 'loading', token: null },
    ],
    [
      'a click request before the handshake proves the frame alive, and asks for the click',
      [ev('interactive')],
      { state: 'needsClick', token: null },
    ],
    ['an expiry proves the frame alive', [ev('expired')], { state: 'unsolved', token: null }],
    [
      'a submit spends the token, and the frame collapses',
      [ev('ready'), ev('interactive'), token(), ev('spend')],
      { state: 'solvedSpent', token: 'tok-1' },
    ],
    [
      'a reset after a spend drops the token',
      [ev('ready'), token(), ev('spend'), ev('reset')],
      { state: 'unsolved', token: null },
    ],
    [
      'nothing to spend before a token',
      [ev('ready'), ev('spend')],
      { state: 'unsolved', token: null },
    ],
  ])('%s', (_label, events, expected) => {
    expect(after(...events)).toEqual(expected)
  })

  it('calls a silent frame blocked once the handshake window has passed', () => {
    vi.useFakeTimers()

    const store = createChallengeStore()

    vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS - 1)
    expect(store.getSnapshot().state).toBe('loading')

    vi.advanceTimersByTime(1)
    expect(store.getSnapshot().state).toBe('blocked')
    store.stop()
  })

  it('stops the handshake clock once any message arrives', () => {
    vi.useFakeTimers()

    const store = createChallengeStore()

    store.send({ type: 'ready' })
    vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS * 3)

    expect(store.getSnapshot().state).toBe('unsolved')
    store.stop()
  })

  // A reset is one of the events the table ignores in `loading`, so the clock must survive it.
  it('keeps the handshake clock through an event that changes nothing', () => {
    vi.useFakeTimers()

    const store = createChallengeStore()

    store.send({ type: 'reset' })
    vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS)

    expect(store.getSnapshot().state).toBe('blocked')
    store.stop()
  })

  it('tells a submit what there is to take', () => {
    expect(canSpend('solvedShown')).toBe(true)
    expect(canSpend('solvedCollapsed')).toBe(true)
    expect(canSpend('solvedSpent')).toBe(false)
    expect(canSpend('unsolved')).toBe(false)
    expect(canSpend('loading')).toBe(false)
    expect(canSpend('blocked')).toBe(false)
  })

  it('notifies a subscriber on a change, and not on one the table ignores', () => {
    const store = createChallengeStore()
    const seen: string[] = []
    const subscription = store.subscribe(() => seen.push(store.getSnapshot().state))

    store.send({ type: 'ready' })
    store.send({ type: 'spend' })
    store.send({ type: 'ready' })

    expect(seen).toEqual(['unsolved'])
    subscription.unsubscribe()
    store.stop()
  })
})
