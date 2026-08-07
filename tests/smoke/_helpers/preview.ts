// Shared helpers for smoke specs that hit the deployed Cloudflare Pages preview.
//
// PREVIEW_URL is injected by CI after discovering the preview deployment
// (scripts/get-cloudflare-preview-url.mjs). When it's absent — local runs,
// forked PRs without secrets — specs skip rather than fail: guard them with
// `test.skipIf(skipWithoutPreview)` and only call fetchPreview inside.

/** Base URL of the preview to smoke-test against, trailing slash trimmed. */
export const PREVIEW_URL = process.env.PREVIEW_URL?.replace(/\/$/, '')

/** True when no preview URL is available — pass to `test.skipIf(...)`. */
export const skipWithoutPreview = !PREVIEW_URL

/**
 * Fetch a path on the preview. Only call when a preview URL is present.
 *
 * `init` takes the usual fetch options — `{ method: 'HEAD' }` for an
 * existence check, where pulling the body would move real megabytes for a
 * status code.
 */
export function fetchPreview(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${PREVIEW_URL}${path}`, init)
}
