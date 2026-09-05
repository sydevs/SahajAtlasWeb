// Shared helpers for smoke specs that test the deployed Cloudflare Pages preview.
//
// CI sets PREVIEW_URL after it finds the preview deployment
// (scripts/get-cloudflare-preview-url.mjs). PREVIEW_URL is empty on a local run or on a
// forked PR with no secrets. In that case, specs skip instead of failing. Guard each spec
// with `test.skipIf(skipWithoutPreview)`, and call fetchPreview only inside the guard.

/** The base URL of the preview to test. The build removes any trailing slash. */
export const PREVIEW_URL = process.env.PREVIEW_URL?.replace(/\/$/, '')

/** True when no preview URL is available. Pass this to `test.skipIf(...)`. */
export const skipWithoutPreview = !PREVIEW_URL

/**
 * Fetches a path on the preview. Call this only when a preview URL is present.
 *
 * `init` takes the usual fetch options. Pass `{ method: 'HEAD' }` for an existence
 * check. A HEAD request skips the body, so it does not move real megabytes just to
 * read a status code.
 */
export function fetchPreview(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${PREVIEW_URL}${path}`, init)
}
