/**
 * `embed.classic.js` — a classic-script bridge to the module loader (#149).
 *
 * **Why it exists.** The loader is an ES module, and `type="module"` is not always ours to set:
 * Wix's Custom Element takes a bare "Server URL" and does not document what script type it
 * injects, and other locked-down hosts inject a plain `<script src>`. Rather than answer that
 * question per platform — and be wrong the day one of them changes — this makes the question
 * irrelevant. A host can point at a classic script and still get the module loader.
 *
 * **Why it bridges by injecting a `<script>` rather than calling `import()`.** Two reasons, and
 * the second is the load-bearing one:
 *
 *  1. It needs no dynamic-import support, so the bridge itself runs anywhere.
 *  2. `document.currentScript` is null inside a dynamic import's callback, so an `import()` bridge
 *     would lose the query string the entire configuration surface rides on. Injecting a real
 *     script tag means the loader reads its own `src` exactly as it does on the normal path — one
 *     configuration mechanism, not two.
 *
 * The query string survives because only the filename is replaced. The loader knows an injected
 * script lands in `<head>` and refuses to render there (`resolveElement`), which is correct: on
 * this path an element always already exists, because the platform created it.
 *
 * ⚠ **This file must never import anything.** It is the one module in the build that may be
 * executed as a classic script, where an `import` statement is a syntax error rather than a
 * feature — and a syntax error here means the widget never loads at all, on exactly the platforms
 * that have no other route. It compiles to itself because it has no imports and no exports, which
 * is why it can be an ordinary build entry despite running in a non-module context;
 * `scripts/check-bundle-size.mjs` asserts the emitted file stays free of module syntax.
 */

// Not `document.currentScript` via a helper, and not read later: it is only valid while this
// script is executing, and this file exists precisely because it runs before modules do.
const script = document.currentScript as HTMLScriptElement | null

if (script?.src) {
  const loader = document.createElement('script')

  loader.type = 'module'
  // Only the filename is replaced, so `?key=…` and every other parameter cross over untouched.
  loader.src = script.src.replace('embed.classic.js', 'auto.js')
  document.head.appendChild(loader)
}
