// Shared helpers for smoke specs that read a deployed preview over the network.
//
// CI sets PREVIEW_URL to the address its own publish step returned (#282), pinned to the
// version just uploaded. PREVIEW_URL is empty on a local run, on a forked PR with no
// secrets, and on a merge-queue entry. In that case, specs skip instead of failing — the
// JOB is what makes a missing preview loud, not the spec. Guard each spec with
// `test.skipIf(skipWithoutPreview)`, and call fetchPreview only inside the guard.

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
