/**
 * Runs `run` once the browser is idle, off the current view's own paint, and returns a cancel.
 * Uses `requestIdleCallback` where available and a short timeout otherwise, since Safari lacks
 * `requestIdleCallback`.
 */
export const scheduleIdle = (run: () => void): (() => void) => {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run)

    return () => cancelIdleCallback(id)
  }

  const id = window.setTimeout(run, 200)

  return () => window.clearTimeout(id)
}
