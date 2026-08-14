/**
 * Pins the values the loader duplicates against the widget's copies (#149).
 *
 * The loader must not import from the widget at runtime — that is what keeps a host's eager cost
 * at ~3 KiB instead of ~370 — so a handful of values exist twice. Duplication is only safe while
 * something asserts the copies agree, which is this file. It is the same arrangement
 * `src/lib/scope.ts` and `scripts/postcss-scope-widget.test.ts` use across the PostCSS boundary.
 *
 * Both sides are imported here because the *spec* has no bundle to keep small. Note which module
 * the widget's element name comes from: `src/lib/element.ts`, a leaf, deliberately not
 * `Widget.tsx` — importing that to read one string would drag mapbox-gl, vaul and every eager
 * view into the node lane.
 */
import { describe, expect, it } from 'vitest'

import { ELEMENT_NAME as LOADER_ELEMENT_NAME, safeLoaderPath } from './literals'
import { parseConfig } from './config'

import { attributeEnabled } from '@/config/privacy'
import { ELEMENT_NAME as WIDGET_ELEMENT_NAME } from '@/lib/element'
import { safePath } from '@/lib/shape'

describe('the loader/widget duplication pins', () => {
  it('agrees on the custom element name', () => {
    expect(LOADER_ELEMENT_NAME).toBe(WIDGET_ELEMENT_NAME)
  })

  // The element name is also a published contract — it is in `docs/embedding.md`, and a Wix
  // Custom Element is configured by typing it into an editor field. Pinning the literal means a
  // rename has to be a deliberate act in three places rather than a refactor in one.
  it('is still `sahaj-atlas`', () => {
    expect(WIDGET_ELEMENT_NAME).toBe('sahaj-atlas')
  })

  describe('safeLoaderPath matches safePath', () => {
    // Every case `safePath`'s docblock argues for, plus the ordinary ones. The three that are
    // easy to lose in a "simplification" are the backslash and the TAB/LF/CR trio: the WHATWG
    // URL parser strips those before parsing, so `/<TAB>/evil.example` is read as
    // `//evil.example` and would walk straight through a check that only looked at the
    // character after the leading slash. #100 found exactly that shape passing.
    const cases = [
      '/map',
      '/gb/london/507',
      '/',
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      '/\r/evil.example',
      '/\t\\evil.example',
      'https://evil.example',
      '//',
      'javascript:alert(1)',
      'relative',
      '',
      ' /map',
    ]

    it.each(cases)('agrees on %j', (value) => {
      expect(safeLoaderPath(value)).toBe(safePath(value))
    })

    it.each([null, undefined])('agrees on %s', (value) => {
      expect(safeLoaderPath(value)).toBe(safePath(value))
    })
  })

  describe('the false/0 rule matches attributeEnabled', () => {
    // The loader parses booleans off the query string and the widget's helper reads them off an
    // attribute, but the RULE has to be one rule: only these two spellings disable, and anything
    // else leaves the feature on. Asserted through `parseConfig` rather than against an exported
    // internal, so this pins the path that actually runs.
    const values = ['false', '0', 'no', 'off', 'FALSE', 'True', 'true', '1', '', 'yes']

    it.each(values)('agrees on %j', (value) => {
      const viaLoader = parseConfig(`https://atlas.example/auto.js?map=${value}`).map

      expect(viaLoader).toBe(attributeEnabled(value))
    })
  })
})
