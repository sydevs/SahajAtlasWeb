// Recovers a session that straddles a deploy: Cloudflare Pages only serves the
// latest deployment's hashed chunks, so a lazy import from a stale session 404s
// (surfaced by Vite as a `vite:preloadError` window event). Reloading picks up
// the new deployment's HTML + chunk graph instead of leaving a dead drawer.
// In the embedded widget this reloads the host page — acceptable, because the
// widget's route survives in the URL hash.

const RELOADED_AT_KEY = 'sahaj-atlas:chunk-reloaded-at'
const RELOAD_WINDOW_MS = 60_000

export function installChunkRecovery() {
  window.addEventListener('vite:preloadError', (event) => {
    if (!armReload(Date.now())) return

    // Prevent Vite from rethrowing the import error — the reload supersedes it.
    event.preventDefault()
    window.location.reload()
  })
}

// At most one reload per window: if reloading didn't heal the session (offline,
// a CDN still serving stale responses), the next failure propagates to the
// ErrorBoundary instead of looping.
function armReload(now: number): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY)) || 0

    if (now - last < RELOAD_WINDOW_MS) return false

    sessionStorage.setItem(RELOADED_AT_KEY, String(now))

    return true
  } catch {
    // Storage unavailable (sandboxed embed) means no loop protection — let the
    // error propagate rather than risk a reload loop.
    return false
  }
}
