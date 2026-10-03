/**
 * Where the built stylesheet lives, now that the widget renders inside a shadow root
 * (#236).
 *
 * A host selector cannot match an element inside a shadow root, which is the whole
 * boundary that move buys. The same cut runs the other way: a stylesheet in the
 * DOCUMENT cannot reach into a shadow root either. So the sheet has to travel with the
 * subtree it styles, and `document.head` stops being a usable home for it.
 *
 * `vite.config.ts` therefore hands every CSS chunk to this module's sink on
 * `globalThis` instead of appending a `<style>`, and each entry adopts the sink into
 * the root it owns — the shadow root for the embed (`Widget.tsx`), the document for the
 * standalone shell (`main.tsx`). Ladle is not in this path at all: `.ladle/vite.config.ts`
 * deliberately skips the injector and imports `globals.css` the ordinary way.
 *
 * ⚠ **`SINK_KEY` and the sink's shape are a contract with a function that cannot import
 * them.** `injectCodeFunction` is stringified into the bundle, so it reaches this module
 * by key alone and a rename here is silent. `sheet.test.ts` reads both files and fails
 * on drift.
 *
 * `@font-face` is NOT here and must not be: a face registered inside a shadow root is
 * never applied. `styles/fonts.ts` keeps putting its own tag in `document.head`, which
 * is why the `'Atlas Rethink Sans'` family-name hack stays load-bearing.
 */

/** The property the build's `injectCodeFunction` writes to on `globalThis`. */
export const SINK_KEY = '__syAtlasCss'

/**
 * One emitted CSS chunk.
 *
 * `id` is Vite's `data-vite-dev-id` — the module id, present only under `pnpm dev`,
 * where an HMR edit re-sends the same module's text. Keying on it is what makes an edit
 * REPLACE a chunk rather than stack a second copy behind it. A production build sends
 * each chunk once and carries no id.
 */
type Chunk = { id: string | null; css: string }

type Sink = {
  chunks: Chunk[]
  /** Re-sync callbacks, one per adopted root. */
  listeners: (() => void)[]
}

function sink(): Sink {
  const scope = globalThis as unknown as Record<string, Sink | undefined>

  return (scope[SINK_KEY] ??= { chunks: [], listeners: [] })
}

/**
 * Adopt the widget's stylesheet into one root, and keep it adopted as later chunks
 * arrive.
 *
 * Lazy chunks are the reason this subscribes rather than reading once: `vite.config.ts`
 * sets `relativeCSSInjection`, so a route's CSS lands when that chunk is imported —
 * long after the first root adopted anything.
 *
 * A root adopted twice is not a second copy: the sheets this call owns are replaced in
 * place, and sheets adopted by anybody else keep their order ahead of ours.
 */
export function adoptStyles(root: DocumentOrShadowRoot): void {
  const live = sink()
  const owned = new Map<string, CSSStyleSheet>()

  const sync = () => {
    const mine = live.chunks.map((chunk, index) => {
      // A build chunk has no id, so its position IS its identity. That is sound
      // because the sink only ever appends: index `n` is the same chunk it was.
      const key = chunk.id ?? `@${index}`
      let sheet = owned.get(key)

      if (!sheet) {
        sheet = new CSSStyleSheet()
        owned.set(key, sheet)
      }

      sheet.replaceSync(chunk.css)

      return sheet
    })

    const foreign = root.adoptedStyleSheets.filter((sheet) => !mine.includes(sheet))

    root.adoptedStyleSheets = [...foreign, ...mine]
  }

  sync()
  live.listeners.push(sync)
}
