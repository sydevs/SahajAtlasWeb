/**
 * The Turnstile challenge page SahajCloud serves, as a stand-in for the browser lane
 * (`tests/browser/fixtures.ts`) and Ladle (`.ladle/vite.config.ts`). It hands its parent a token
 * at once, and a fresh one on every `reset` — what a passed, invisible challenge does.
 *
 * ⚠ The channel and the message types are `src/hooks/use-turnstile.ts`'s contract with
 * SahajCloud, restated: change them there and here together, or every registration waits on a
 * token that never arrives, and the interface's own probe fails the widget.
 *
 * Imports nothing, so Ladle's Vite config can load it.
 */
export const CHALLENGE_PAGE = `<!doctype html><meta charset="utf-8"><script>
const params = new URLSearchParams(location.search)
const post = (message) =>
  parent.postMessage({ channel: 'sahaj-atlas-turnstile', ...message }, params.get('parent'))
let solved = 0
const solve = () => post({ type: 'token', token: 'browser-lane-token-' + ++solved })
post({ type: 'ready' })
if (!params.has('probe')) solve()
addEventListener('message', (event) => {
  if (event.data?.channel === 'sahaj-atlas-turnstile' && event.data.type === 'reset') solve()
})
</script>`

/** Where the app frames it, under SahajCloud's origin (`use-turnstile.ts`). */
export const CHALLENGE_PATH = '/api/atlas/challenge'
