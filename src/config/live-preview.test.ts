import { beforeAll, describe, expect, it } from 'vitest'

import { verifyLivePreviewToken } from './live-preview'

/**
 * The consumer half of a cross-repo format.
 *
 * SahajCloud mints these tokens; this widget verifies them and imports nothing
 * from there. So the format is written twice, and these cases mint with the
 * **same construction** the CMS's `mintLivePreviewToken` uses. A change on
 * either side fails here before it breaks live preview.
 */

const ROLE = 'sahaj-atlas-client'
const NOW = 1_800_000_000

let verifyKeyBase64: string
let otherVerifyKeyBase64: string
let sign: (claims: Record<string, unknown>) => Promise<string>

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes as ArrayBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair

  verifyKeyBase64 = btoa(
    String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
  )

  const other = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair

  otherVerifyKeyBase64 = btoa(
    String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', other.publicKey))),
  )

  sign = async (claims) => {
    const body = base64url(new TextEncoder().encode(JSON.stringify(claims)))
    const signature = await crypto.subtle.sign(
      'Ed25519',
      pair.privateKey,
      new TextEncoder().encode(body),
    )

    return `${body}.${base64url(signature)}`
  }
})

describe('verifyLivePreviewToken', () => {
  it('accepts a token minted for this widget', async () => {
    const token = await sign({ role: ROLE, exp: NOW + 600 })

    expect(await verifyLivePreviewToken(token, verifyKeyBase64, NOW)).toBe(true)
  })

  it('refuses a token minted for We Meditate Web', async () => {
    // One leaked preview URL must not unlock both surfaces.
    const token = await sign({ role: 'wemeditate-web-client', exp: NOW + 600 })

    expect(await verifyLivePreviewToken(token, verifyKeyBase64, NOW)).toBe(false)
  })

  it('refuses an expired token, and at the exact expiry second', async () => {
    const token = await sign({ role: ROLE, exp: NOW })

    expect(await verifyLivePreviewToken(token, verifyKeyBase64, NOW - 1)).toBe(true)
    expect(await verifyLivePreviewToken(token, verifyKeyBase64, NOW)).toBe(false)
  })

  it('refuses claims edited to extend the expiry', async () => {
    const token = await sign({ role: ROLE, exp: NOW + 600 })
    const forged = base64url(
      new TextEncoder().encode(JSON.stringify({ role: ROLE, exp: NOW + 9_999_999 })),
    )

    expect(
      await verifyLivePreviewToken(`${forged}.${token.split('.')[1]}`, verifyKeyBase64, NOW),
    ).toBe(false)
  })

  it('refuses a token signed by another key', async () => {
    const token = await sign({ role: ROLE, exp: NOW + 600 })

    expect(await verifyLivePreviewToken(token, otherVerifyKeyBase64, NOW)).toBe(false)
  })

  it('refuses everything when no verify key is configured', async () => {
    const token = await sign({ role: ROLE, exp: NOW + 600 })

    expect(await verifyLivePreviewToken(token, '', NOW)).toBe(false)
  })

  it('refuses malformed input without throwing', async () => {
    // Load-bearing: this runs at boot, before React mounts. A throw here takes
    // the whole widget down on a host page over a stray query parameter.
    for (const bad of ['', '.', 'nodot', 'a.b', '....', 'YQ.YQ']) {
      expect(await verifyLivePreviewToken(bad, verifyKeyBase64, NOW)).toBe(false)
    }
  })
})
