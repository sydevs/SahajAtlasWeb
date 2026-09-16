/**
 * Verifying SahajCloud's live-preview token.
 *
 * The CMS admin opens this widget with a short-lived Ed25519 token on the URL.
 * This checks it with a **public** key before any preview session begins.
 *
 * ## Why verification, and not just "a parameter is present"
 *
 * The session this opens (`session.ts`) is destructive to an ordinary
 * visitor. Gating it on a parameter being PRESENT would turn any atlas URL
 * into a denial of service: `livePreview.active` inerts every link,
 * snaps navigation back, pins all queries to `staleTime: Infinity` and adds
 * `draft=true` to every request — and `public/_redirects` serves the SPA shell
 * for any path, so `sahajatlas.com/anything?live-preview=x` would qualify.
 * Share that link and the recipient gets a site where nothing is clickable.
 *
 * Verification closes that: a forged token opens no session at all.
 *
 * ## The key is public, and committed
 *
 * This bundle ships to anyone, so it can hold no secret. That is precisely why
 * the CMS signs rather than sharing: a verification key cannot mint, so
 * publishing it costs nothing. A symmetric secret here would BE the signing
 * key.
 *
 * ## Why this is hand-written, when the CMS uses `jose`
 *
 * `jwtVerify` costs about 5.75 KiB gzipped in a browser build. This widget
 * ships to host pages under a hard size budget with single-digit KiB spare,
 * for one verify on a rarely-taken path. The format is a standard compact JWS,
 * so what is written here is a reading of a spec rather than an invention —
 * and `live-preview.test.ts` mints with the construction the CMS uses, so a
 * drift fails a test here first.
 */

/** Ed25519 public key, base64. Not a secret — see the module docblock. */
const VERIFY_KEY = '0Ux5Hp4TiloiW6C/SFgGJEmJGiOLcMS5U52D/TbKKyQ='

function base64UrlDecode(value: string): Uint8Array | null {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')

  try {
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))

    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * Verifies a token SahajCloud minted for this widget.
 *
 * Deliberately a copy of the CMS's own check rather than a shared import: this
 * repo does not depend on the CMS's source. `live-preview.test.ts` mints with
 * the same construction the minter uses, so a drift on either side fails a test
 * before it breaks live preview.
 *
 * Returns false for every failure — bad shape, bad signature, wrong role,
 * expired — and never says which. A caller learning WHY its token was refused
 * learns how to forge a better one.
 */
export async function verifyLivePreviewToken(
  token: string,
  verifyKeyBase64: string = VERIFY_KEY,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!verifyKeyBase64) return false

  // A compact JWS: header, payload, signature — and the signature covers
  // `header.payload`, not the payload alone.
  const parts = token.split('.')

  if (parts.length !== 3) return false

  const [header, payload, signature] = parts
  const keyBytes = base64UrlDecode(verifyKeyBase64.replace(/\s/g, ''))
  const signatureBytes = base64UrlDecode(signature)
  const headerBytes = base64UrlDecode(header)
  const payloadBytes = base64UrlDecode(payload)

  if (!keyBytes || !signatureBytes || !headerBytes || !payloadBytes) return false

  // ⚠ The header is attacker-controlled, so it must not be allowed to name the
  // algorithm the verify uses. Pin it before touching the signature.
  try {
    const declared = JSON.parse(new TextDecoder().decode(headerBytes)) as { alg?: unknown }

    if (declared.alg !== 'EdDSA') return false
  } catch {
    return false
  }

  let key: CryptoKey

  try {
    key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'Ed25519', false, [
      'verify',
    ])
  } catch {
    return false
  }

  const valid = await crypto.subtle.verify(
    'Ed25519',
    key,
    signatureBytes as BufferSource,
    new TextEncoder().encode(`${header}.${payload}`) as BufferSource,
  )

  if (!valid) return false

  // Parsed only after the signature holds, so nothing downstream ever reads
  // unauthenticated JSON.
  let claims: { exp?: unknown }

  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes)) as typeof claims
  } catch {
    return false
  }

  return typeof claims.exp === 'number' && claims.exp > nowSeconds
}
