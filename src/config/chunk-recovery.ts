// Recovers a session that straddles a deploy: Cloudflare Pages only serves the
// latest deployment's hashed chunks, so a lazy import from a stale session 404s
// (surfaced by Vite as a `vite:preloadError` window event). Reloading picks up
// the new deployment's HTML + chunk graph instead of leaving a dead drawer.
// In the embedded widget this reloads the host page — acceptable, because the
// widget's route survives in the URL hash.

const RELOADED_AT_KEY = 'sahajAtlas.chunkReloadedAt'
const RELOAD_WINDOW_MS = 60_000

export function installChunkRecovery() {
  window.addEventListener('vite:preloadError', (event) => {
    if (!armReload()) return

    // Prevent Vite from rethrowing the import error — the reload supersedes it.
    // (The swallowed import resolves undefined, so the ErrorFallback can flash
    // briefly until the reload lands; accepted over surfacing a dead drawer.)
    event.preventDefault()
    window.location.reload()
  })
}

// At most one reload per window: if reloading didn't heal the session (offline,
// a CDN still serving stale responses), the next failure propagates to the
// ErrorBoundary instead of looping.
function armReload(): boolean {
  try {
    const now = Date.now()
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY)) || 0

    // A stamp in the future (clock stepped backward: NTP, VM resume) must read
    // as expired, or recovery stays dead until the clock catches up.
    if (now >= last && now - last < RELOAD_WINDOW_MS) return false

    sessionStorage.setItem(RELOADED_AT_KEY, String(now))

    return true
  } catch {
    // Storage unavailable (sandboxed embed) means no loop protection — let the
    // error propagate rather than risk a reload loop.
    return false
  }
}
