import { describe, expect, it } from 'vitest'

import {
  CHALLENGE_CHANNEL,
  CHALLENGE_PATH,
  challengeMessage,
  challengeSrc,
  parseChallengeEvent,
} from './turnstile-frame'

/**
 * The frame protocol, in the node lane. The transport is spec'd in `use-turnstile.test.tsx`,
 * which needs a DOM; everything here is a string. The page's half lives in SahajCloud and is
 * spec'd there (`tests/unit/atlas-challenge.spec.ts`).
 */

const SERVER = 'https://cloud.sydevelopers.com'
const OPTIONS = { parent: 'https://partner.org', theme: 'dark', language: 'cs' } as const

describe('challengeSrc', () => {
  it('addresses the challenge page on the SahajCloud origin', () => {
    const url = new URL(challengeSrc(SERVER, OPTIONS))

    expect(url.origin).toBe(SERVER)
    expect(url.pathname).toBe(CHALLENGE_PATH)
  })

  it('carries the parent origin, theme and language the page renders with', () => {
    const url = new URL(challengeSrc(SERVER, OPTIONS))

    // The page hands its token to this origin and no other, so it is the one parameter whose
    // loss would silently break every embed: SahajCloud refuses a frame that names no parent.
    expect(url.searchParams.get('parent')).toBe('https://partner.org')
    expect(url.searchParams.get('theme')).toBe('dark')
    expect(url.searchParams.get('language')).toBe('cs')
    expect(url.searchParams.get('probe')).toBeNull()
  })

  it('marks a probe frame, so it hands back the handshake and renders nothing', () => {
    const url = new URL(challengeSrc(SERVER, { ...OPTIONS, probe: true }))

    expect(url.searchParams.get('probe')).toBe('1')
  })

  it('follows a local SahajCloud, so `pnpm dev` against one frames it', () => {
    expect(new URL(challengeSrc('http://localhost:3000', OPTIONS)).origin).toBe(
      'http://localhost:3000',
    )
  })
})

describe('parseChallengeEvent', () => {
  const on = (message: Record<string, unknown>) => ({ channel: CHALLENGE_CHANNEL, ...message })

  it.each(['ready', 'expired', 'error'])('reads %s', (type) => {
    expect(parseChallengeEvent(on({ type }))).toEqual({ type })
  })

  it.each(['origin', 'unavailable'] as const)('keeps the refusal reason %s', (reason) => {
    expect(parseChallengeEvent(on({ type: 'error', reason }))).toEqual({ type: 'error', reason })
  })

  it('reads an unknown reason as a plain error rather than ignoring it', () => {
    // A newer page must never make an older widget wait out its handshake timeout.
    expect(parseChallengeEvent(on({ type: 'error', reason: 'quota' }))).toEqual({ type: 'error' })
  })

  it('reads a token', () => {
    expect(parseChallengeEvent(on({ type: 'token', token: 'tok' }))).toEqual({
      type: 'token',
      token: 'tok',
    })
  })

  it.each([
    // The host page's own cross-frame traffic, which this shape is indistinguishable from
    // without the channel marker.
    ['no channel', { type: 'token', token: 'tok' }],
    ['another channel', { channel: 'other-widget', type: 'token', token: 'tok' }],
    ['an unknown type', on({ type: 'solved' })],
    // An empty token would enable Submit and then fail verification, which reads to a visitor
    // as the form being broken rather than the challenge.
    ['an empty token', on({ type: 'token', token: '' })],
    ['a non-string token', on({ type: 'token', token: 42 })],
    ['no token', on({ type: 'token' })],
    ['a string', 'ready'],
    ['null', null],
  ])('refuses %s', (_label, data) => {
    expect(parseChallengeEvent(data)).toBeNull()
  })
})

describe('challengeMessage', () => {
  it('stamps the channel on everything the widget sends', () => {
    expect(challengeMessage({ type: 'reset' })).toEqual({
      channel: CHALLENGE_CHANNEL,
      type: 'reset',
    })
  })
})
