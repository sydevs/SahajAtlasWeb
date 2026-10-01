import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { SINK_KEY } from './sheet'

// `vite.config.ts`'s `styleSink` is STRINGIFIED into the bundle, so it cannot import
// `SINK_KEY` or the chunk shape from the module that reads them. Prose is the only thing
// joining the two halves, which is exactly the coupling #153 broke across the loader seam
// with a one-line edit. These read both files and fail on drift.
const config = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8')
const sheet = readFileSync(new URL('./sheet.ts', import.meta.url), 'utf8')

describe('the CSS sink contract with vite.config.ts', () => {
  it('writes to the key this module reads', () => {
    expect(SINK_KEY).toBe('__syAtlasCss')
    expect(config).toContain(`scope.${SINK_KEY} ||=`)
  })

  it('seeds both halves of the sink, so a listener registered first is never dropped', () => {
    expect(config).toContain('{ chunks: [], listeners: [] }')
    expect(sheet).toContain('{ chunks: [], listeners: [] }')
  })

  it('notifies the listeners, so a lazy chunk reaches an already-adopted root', () => {
    expect(config).toContain('for (const listener of sink.listeners) listener()')
  })

  it('keys a chunk on the dev module id, so an HMR edit replaces instead of stacking', () => {
    expect(config).toContain("attributes['data-vite-dev-id']")
  })

  // The key and the seed were pinned above; the per-chunk FIELD names were not, and their
  // drift is the silent one. Rename `css` to `text` in the sink and every other assertion
  // here stays green, the CSS gate stays green — it reads the template literal, never the
  // object — and `replaceSync(undefined)` then writes the string "undefined" into every
  // constructed sheet, shipping the widget with no styles at all.
  it('names the chunk fields this module reads', () => {
    expect(config).toContain('sink.chunks.push({ id: id, css: cssCode })')
    expect(config).toContain('existing.css = cssCode')
    expect(sheet).toContain('chunk.css')
    expect(sheet).toContain('chunk.id')
  })

  // `assert-css-scoped.mjs` counts injection sites by this marker rather than by the sink
  // key, because `sheet.ts` names the key too — as the reader — and a chunk carrying this
  // module would then count one site more than it holds. That is a real failure mode: it
  // read 4 sites against 3 stylesheets on the first build of #236.
  it('carries the marker the CSS gate counts sites by', () => {
    const gate = readFileSync(
      new URL('../../scripts/assert-css-scoped.mjs', import.meta.url),
      'utf8',
    )

    expect(gate).toContain("const INJECTION_MARKER = 'data-vite-dev-id'")
    expect(config).toContain('data-vite-dev-id')
  })

  // The injector's own `attributes` option is what used to name the style tag, and the tag
  // is gone with the head injection. A sink that also appended one would mean a second,
  // document-level copy of the sheet standing beside the adopted one — bytes parsed twice,
  // and a cascade with two of everything in it.
  it('appends no style tag of its own', () => {
    expect(config).not.toContain('sahaj-atlas-style')
    expect(config).not.toMatch(/appendChild|createElement\(['"`]style['"`]\)/)
  })
})

describe('adoptStyles', () => {
  it('is the only exported way in, so no caller reaches the sink directly', () => {
    expect(sheet).toContain('export function adoptStyles')
    expect(sheet).not.toMatch(/export (function|const) sink\b/)
  })
})
