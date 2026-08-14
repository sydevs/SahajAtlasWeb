/**
 * Emits `embed.classic.js` — a classic (non-module) bridge to the module loader.
 *
 * WHY (#149): the loader is an ES module, and `type="module"` is not always ours to set. Wix's
 * Custom Element takes a bare "Server URL" and does not document what script type it injects, and
 * other locked-down hosts inject a plain `<script src>`. Rather than answer that question per
 * platform — and be wrong the day one of them changes — this shim makes it irrelevant: a host can
 * point at a classic script and still get the module loader.
 *
 * It is emitted by hand rather than built as a third Rollup entry because **output format is a
 * whole-build setting**. Producing one classic file out of a module build would mean a second
 * Vite build, its own config and its own budget line, for what is four statements of ES5.
 *
 * **It bridges by injecting a module `<script>`, not by calling `import()`.** Two reasons, and the
 * second is the load-bearing one:
 *
 *  1. It needs no dynamic-import support, so the shim itself runs anywhere.
 *  2. `document.currentScript` is null inside a dynamic import's callback, so an `import()` bridge
 *     would lose the query string the whole configuration surface rides on. Injecting a real
 *     script tag means the loader reads its own `src` exactly as it does on the normal path — one
 *     configuration mechanism, not two.
 *
 * The query string survives because only the filename is replaced. The loader knows an injected
 * script lands in `<head>` and refuses to render there (`resolveElement`), which is correct: on
 * this path the element always already exists, because the platform created it.
 */

/** The shim's source. ES5 only — this is the one file that may run before module support. */
const SHIM = `(function () {
  var s = document.currentScript
  if (!s || !s.src) return
  var m = document.createElement('script')
  m.type = 'module'
  m.src = s.src.replace('embed.classic.js', 'auto.js')
  document.head.appendChild(m)
})()
`

/** @returns {import('vite').Plugin} */
export function emitClassicShim() {
  return {
    name: 'sy-emit-classic-shim',
    apply: 'build',
    generateBundle(_options, bundle) {
      // Only the build that emits the loader emits its shim. `pnpm ladle:build` and any sub-build
      // share this config but produce no `auto.js`, and a shim pointing at a file that is not
      // there is worse than no shim.
      if (!bundle['auto.js']) return

      this.emitFile({ type: 'asset', fileName: 'embed.classic.js', source: SHIM })
    },
  }
}

/** Exported for the spec that pins the shim's contract. */
export const CLASSIC_SHIM_SOURCE = SHIM
