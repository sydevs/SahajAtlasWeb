/**
 * Verifying SahajCloud's live-preview token.
 *
 * The CMS admin opens this widget with a short-lived Ed25519 token on the URL.
 * This checks it with a **public** key before any preview session begins.
 *
 * ## Why verification, and not just "a parameter is present"
 *
 * The existing session (`config/preview.ts`) validates nothing — it reads
 * `secret` off the URL and trusts it, gated only by the pathname being
 * `/preview`. Widening that gate to every route without verifying would turn
 * any atlas URL into a denial of service: `preview.active` inerts every link,
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
 * ## The token names a role
 *
 * It carries the API-client role that may redeem it, and SahajCloud matches
 * that against the roles on the key the request authenticates with. Checking it
 * here too means a token minted for We Meditate Web never opens a session on
 * the atlas.
 */

/** The query parameter carrying the token. Matches WeMeditateWeb's spelling. */
export const LIVE_PREVIEW_PARAM = 'live-preview'

/** The API-client role this widget's key holds. */
const CLIENT_ROLE = 'sahaj-atlas-client'

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

  const [body, signature] = token.split('.')

  if (!body || !signature) return false

  const keyBytes = base64UrlDecode(verifyKeyBase64.replace(/\s/g, ''))
  const signatureBytes = base64UrlDecode(signature)
  const claimsBytes = base64UrlDecode(body)

  if (!keyBytes || !signatureBytes || !claimsBytes) return false

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
    new TextEncoder().encode(body) as BufferSource,
  )

  if (!valid) return false

  // Parsed only after the signature holds, so nothing downstream ever reads
  // unauthenticated JSON.
  let claims: { role?: unknown; exp?: unknown }

  try {
    claims = JSON.parse(new TextDecoder().decode(claimsBytes)) as typeof claims
  } catch {
    return false
  }

  if (claims.role !== CLIENT_ROLE) return false
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return false

  return true
}
