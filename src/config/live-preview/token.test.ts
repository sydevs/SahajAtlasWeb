import { beforeAll, describe, expect, it } from 'vitest'

import { verifyLivePreviewToken } from './token'

/**
 * The consumer half of a cross-repo format.
 *
 * SahajCloud mints these tokens with `jose`; this widget verifies them by hand,
 * because `jwtVerify` costs ~5.75 KiB gzipped and this bundle ships to host
 * pages under a hard budget. So these cases mint the **same** construction the
 * CMS does — an EdDSA compact JWS carrying only `exp`, no `iat` — and a drift
 * on either side fails here before it breaks live preview.
 */

const NOW = 1_800_000_000

let verifyKeyBase64: string
let otherVerifyKeyBase64: string
let sign: (claims: Record<string, unknown>, alg?: string) => Promise<string>

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
  const other = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair

  const raw = async (key: CryptoKey) =>
    btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', key))))

  verifyKeyBase64 = await raw(pair.publicKey)
  otherVerifyKeyBase64 = await raw(other.publicKey)

  sign = async (claims, alg = 'EdDSA') => {
    const header = base64url(new TextEncoder().encode(JSON.stringify({ alg })))
    const payload = base64url(new TextEncoder().encode(JSON.stringify(claims)))
    const signature = await crypto.subtle.sign(
      'Ed25519',
      pair.privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    )

    return `${header}.${payload}.${base64url(signature)}`
  }
})

describe('verifyLivePreviewToken', () => {
  it('accepts a token the CMS would mint', async () => {
    expect(await verifyLivePreviewToken(await sign({ exp: NOW + 600 }), verifyKeyBase64, NOW)).toBe(
      true,
    )
  })

  it('refuses an expired token, and at the exact expiry second', async () => {
    const token = await sign({ exp: NOW })

    expect(await verifyLivePreviewToken(token, verifyKeyBase64, NOW - 1)).toBe(true)
    expect(await verifyLivePreviewToken(token, verifyKeyBase64, NOW)).toBe(false)
  })

  it('refuses a payload edited to extend the expiry', async () => {
    const token = await sign({ exp: NOW + 600 })
    const [header, , signature] = token.split('.')
    const forged = base64url(new TextEncoder().encode(JSON.stringify({ exp: NOW + 9_999_999 })))

    expect(
      await verifyLivePreviewToken(`${header}.${forged}.${signature}`, verifyKeyBase64, NOW),
    ).toBe(false)
  })

  it('refuses a token signed by another key', async () => {
    expect(
      await verifyLivePreviewToken(await sign({ exp: NOW + 600 }), otherVerifyKeyBase64, NOW),
    ).toBe(false)
  })

  it('refuses a header that nominates a different algorithm', async () => {
    // The classic JWS confusion. The header is attacker-controlled, so it must
    // not get to choose what the verify uses.
    expect(
      await verifyLivePreviewToken(await sign({ exp: NOW + 600 }, 'none'), verifyKeyBase64, NOW),
    ).toBe(false)
  })

  it('refuses everything when no verify key is configured', async () => {
    expect(await verifyLivePreviewToken(await sign({ exp: NOW + 600 }), '', NOW)).toBe(false)
  })

  it('refuses malformed input without throwing', async () => {
    // Load-bearing: this runs at boot, before React mounts. A throw here takes
    // the whole widget down on a host page over a stray query parameter.
    for (const bad of ['', '.', 'nodot', 'a.b', 'a.b.c', '....', 'YQ.YQ.YQ']) {
      expect(await verifyLivePreviewToken(bad, verifyKeyBase64, NOW)).toBe(false)
    }
  })
})
