/**
 * `auto.js` — the file a host installs: a bridge that starts the module loader, `loader.js`.
 *
 * **Why it exists.** A host does not always write its own `<script>` tag. Wix's Custom Element
 * writes `<script src="…/auto.js?key=…">` into `<head>` with no `type` — observed on a live
 * client site, 2026-11-15 — and so does any optimiser that drops the attribute. A classic script
 * cannot hold an `import` statement, and the loader always has one: rolldown gives it a static
 * import of its preload helper. So this file is the half that parses either way, and it hands
 * over to the half that cannot.
 *
 * **It hands over by inserting a module `<script>`, and passes on nothing else.** The loader still
 * finds this file's own tag (`script[src*="auto.js"]`) for its settings and its position, so there
 * stays one configuration path. The query string rides along on `loader.js` only so two
 * different snippets stay two module instances, as they were when this file was the loader —
 * otherwise the module map would collapse them, and the second would never reach the loader's
 * "more than once" warning.
 *
 * ⚠ **This file must never import anything, and must declare nothing at its top level.** Run as
 * a classic script, an `import` or `export` is a syntax error, so the widget never loads and
 * nothing of ours can say why. A top-level binding lands in the host's global scope, where a
 * later `let` of the same name throws. Even a value import from `./literals` breaks the first
 * rule: rolldown factors a module both entries import into a shared chunk. `pnpm build` runs the
 * built file as a classic script, twice, to hold both rules (`scripts/assert-classic-bridge.mjs`).
 */
;(() => {
  try {
    // A classic script is `currentScript` while it runs. A module never is, so a host that loads
    // this with `type="module"` gets the same lookup the loader uses.
    const script =
      (document.currentScript as HTMLScriptElement | null) ??
      document.querySelector<HTMLScriptElement>('script[src*="auto.js"]')

    if (!script?.src) {
      console.error('[sahaj-atlas] could not find the auto.js script tag, so nothing will load.')

      return
    }

    const src = new URL('./loader.js', script.src)
    const loader = document.createElement('script')

    src.search = new URL(script.src).search
    loader.type = 'module'
    loader.src = src.href
    // A nonce-only CSP refuses an inserted script that does not carry the page's nonce.
    if (script.nonce) loader.nonce = script.nonce
    document.head.appendChild(loader)
  } catch (reason) {
    // A host that broke `console` must not turn this into an uncaught error on its page.
    try {
      console.error('[sahaj-atlas] could not start the loader, so nothing will load.', reason)
    } catch {
      // Nothing left to report through.
    }
  }
})()
