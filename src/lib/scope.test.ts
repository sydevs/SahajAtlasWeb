import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { WIDGET_SCOPE_CLASS } from './scope'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// The scope class is agreed between a build-time PostCSS pass and three runtime
// entry points, and a mismatch is invisible to every other gate: the CSS still
// builds, lint and typecheck pass, and the widget simply renders with no styles at
// all on a host page. So the agreement is asserted rather than assumed.
describe('widget scope class', () => {
  it('matches the scope the PostCSS pass writes into the stylesheet', () => {
    expect(read('scripts/postcss-scope-widget.mjs')).toContain(
      `export const WIDGET_SCOPE = '${WIDGET_SCOPE_CLASS}'`,
    )
  })

  it('is on the embedded widget wrapper', () => {
    // The one that matters most: drop it here and every host embed renders with no
    // styles at all, while lint, typecheck and the rest of the lane stay green.
    expect(read('src/Widget.tsx')).toContain('WIDGET_SCOPE_CLASS')
  })

  it('is on the standalone build root', () => {
    // Standalone has no widget wrapper, so <html> is the theme root and has to carry it.
    expect(read('index.html')).toMatch(new RegExp(`<html[^>]*class="[^"]*${WIDGET_SCOPE_CLASS}`))
  })

  it('is applied by the Ladle decorator', () => {
    expect(read('.ladle/components.tsx')).toContain('WIDGET_SCOPE_CLASS')
  })
})
