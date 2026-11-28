import { afterEach, describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'

import {
  type ChallengeEvent,
  HANDSHAKE_TIMEOUT_MS,
  challengeMachine,
  challengeView,
} from './challenge-machine'

const token = (value = 'tok-1'): ChallengeEvent => ({ type: 'token', token: value })
const ev = (type: Exclude<ChallengeEvent['type'], 'token'>) => ({ type }) as ChallengeEvent

/** Runs `events` through a fresh machine and reads the view the hook would publish. */
function after(...events: ChallengeEvent[]) {
  const actor = createActor(challengeMachine).start()

  for (const event of events) actor.send(event)

  const snapshot = actor.getSnapshot()

  actor.stop()

  return { state: snapshot.value, ...challengeView(snapshot) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('challengeMachine', () => {
  it.each<[string, ChallengeEvent[], ReturnType<typeof after>]>([
    [
      'starts silent',
      [],
      { state: 'loading', status: 'loading', token: null, needsClick: false, frameShown: false },
    ],
    [
      'handshake',
      [ev('ready')],
      { state: 'unsolved', status: 'ready', token: null, needsClick: false, frameShown: false },
    ],
    [
      'Cloudflare asks for a click',
      [ev('ready'), ev('interactive')],
      { state: 'needsClick', status: 'ready', token: null, needsClick: true, frameShown: true },
    ],
    [
      'the click window closes unsolved',
      [ev('ready'), ev('interactive'), ev('settled')],
      { state: 'unsolved', status: 'ready', token: null, needsClick: false, frameShown: false },
    ],
    // The success mark stays on screen until the page says the window closed.
    [
      'solved by the click',
      [ev('ready'), ev('interactive'), token()],
      {
        state: { solved: 'shown' },
        status: 'ready',
        token: 'tok-1',
        needsClick: false,
        frameShown: true,
      },
    ],
    [
      'solved by the click, then settled',
      [ev('ready'), ev('interactive'), token(), ev('settled')],
      {
        state: { solved: 'collapsed' },
        status: 'ready',
        token: 'tok-1',
        needsClick: false,
        frameShown: false,
      },
    ],
    [
      'solved invisibly',
      [ev('ready'), token()],
      {
        state: { solved: 'collapsed' },
        status: 'ready',
        token: 'tok-1',
        needsClick: false,
        frameShown: false,
      },
    ],
    [
      'a token before the handshake still counts',
      [token()],
      {
        state: { solved: 'collapsed' },
        status: 'ready',
        token: 'tok-1',
        needsClick: false,
        frameShown: false,
      },
    ],
    [
      'a refreshed token replaces the old one',
      [ev('ready'), token('tok-1'), token('tok-2')],
      {
        state: { solved: 'collapsed' },
        status: 'ready',
        token: 'tok-2',
        needsClick: false,
        frameShown: false,
      },
    ],
    [
      'expiry drops the token without blocking',
      [ev('ready'), token(), ev('expired')],
      { state: 'unsolved', status: 'ready', token: null, needsClick: false, frameShown: false },
    ],
    [
      'reset drops the spent token',
      [ev('ready'), token(), ev('reset')],
      { state: 'unsolved', status: 'ready', token: null, needsClick: false, frameShown: false },
    ],
    [
      'error drops the token and blocks',
      [ev('ready'), token(), ev('error')],
      { state: 'blocked', status: 'blocked', token: null, needsClick: false, frameShown: false },
    ],
    [
      'blocked does not latch against a token',
      [ev('error'), token('tok-2')],
      {
        state: { solved: 'collapsed' },
        status: 'ready',
        token: 'tok-2',
        needsClick: false,
        frameShown: false,
      },
    ],
    [
      'blocked does not latch against a click request',
      [ev('error'), ev('interactive')],
      { state: 'needsClick', status: 'ready', token: null, needsClick: true, frameShown: true },
    ],
    [
      'a reset while blocked changes nothing',
      [ev('error'), ev('reset')],
      { state: 'blocked', status: 'blocked', token: null, needsClick: false, frameShown: false },
    ],
    [
      'a reset before the handshake changes nothing',
      [ev('reset')],
      { state: 'loading', status: 'loading', token: null, needsClick: false, frameShown: false },
    ],
    [
      'an expiry proves the frame alive',
      [ev('expired')],
      { state: 'unsolved', status: 'ready', token: null, needsClick: false, frameShown: false },
    ],
  ])('%s', (_label, events, expected) => {
    expect(after(...events)).toEqual(expected)
  })

  it('calls a silent frame blocked once the handshake window has passed', () => {
    vi.useFakeTimers()

    const actor = createActor(challengeMachine).start()

    vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS - 1)
    expect(challengeView(actor.getSnapshot()).status).toBe('loading')

    vi.advanceTimersByTime(1)
    expect(challengeView(actor.getSnapshot()).status).toBe('blocked')
    actor.stop()
  })

  it('stops the handshake clock once any message arrives', () => {
    vi.useFakeTimers()

    const actor = createActor(challengeMachine).start()

    actor.send({ type: 'ready' })
    vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS * 3)

    expect(challengeView(actor.getSnapshot()).status).toBe('ready')
    actor.stop()
  })
})
