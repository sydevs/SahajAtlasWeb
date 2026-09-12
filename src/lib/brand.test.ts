import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * The widget must not name itself in front of a visitor (#156).
 *
 * The point of white-labelling is that the atlas reads as the host's own events feature, and a
 * single stray "Sahaj Atlas" undoes that on whatever screen carries it. Copy is the easiest thing
 * in this repo to reintroduce by accident: a new locale key, a new fallback sentence, a title
 * attribute added for clarity.
 *
 * So the enumeration IS the enforcement, the same arrangement `href.test.ts` uses for the app's
 * three JSX anchors and `responsive.test.ts` uses for its viewport call sites. A brand string
 * reappearing turns the unit lane red with instructions, rather than shipping.
 *
 * **What this deliberately does NOT catch**, because none of it is visitor-facing:
 *
 * - `sahaj-atlas`, `sahaj-atlas-style`, `sy-atlas` — DOM identifiers, and a documented public
 *   contract hosts key off. The pattern requires whitespace-or-nothing between the two words, so a
 *   hyphen does not match.
 * - `sahajatlas.com` / `atlas.sydevelopers.com` — origins. Real infrastructure, and the ICS `UID`
 *   in particular must never change (it is a calendar dedupe key). Only the files listed below are
 *   scanned, and none of them is where an origin belongs.
 * - `src/types/payload/**` — generated from the CMS, and its enums genuinely contain
 *   `wemeditate-web`.
 */
const BRAND = /sahaj\s*atlas|we\s?meditate/i

/**
 * The committed English snapshot: what `pnpm sync:translations --write` pulls out of SahajCloud,
 * and the copy the widget boots with (#198).
 *
 * ⚠ **This checks one locale where it used to check ten, and that is a real narrowing.** The nine
 * other languages now live in the CMS, where nothing here can read them — a brand name typed into
 * the French copy is caught by a SahajCloud-side gate or not at all. What this still holds is the
 * direction that matters most: English is the source every translator works from, so a brand name
 * reaches the other nine through it.
 */
const copySnapshot = () => 'src/config/translations.en.json'

/**
 * Source files that carry user-visible copy.
 *
 * A named list rather than a walk of `src/**`, and the difference matters: a walk would sweep up
 * console diagnostics, docblocks and the element name, and the noise would get the whole check
 * disabled the first time somebody hit a false positive. Add a file here when it starts carrying
 * a string a visitor can read.
 */
const COPY_FILES = [
  'index.html',
  'src/App.tsx',
  'src/lib/ics.ts',
  'src/styles/fonts.ts',
  'src/components/molecules/Fallbacks/Fallbacks.tsx',
  'src/components/molecules/EventMetadata/EventMetadata.tsx',
  // The compact form's whole visible surface is a heading and one button (#161), which makes
  // it the single easiest screen in the app to name after the product by accident.
  'src/views/CompactEmbedView/CompactEmbedView.tsx',
]

describe('no brand names reach a visitor', () => {
  it(copySnapshot(), () => {
    expect(readFileSync(copySnapshot(), 'utf8')).not.toMatch(BRAND)
  })

  it.each(COPY_FILES)('%s', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(BRAND)
  })

  // Guards the guard: a pattern that matched nothing would pass every case above forever.
  it('would catch a reintroduced brand string', () => {
    expect('Sahaj Atlas — free meditation classes').toMatch(BRAND)
    expect('on Sahaj Atlas').toMatch(BRAND)
    expect('We Meditate').toMatch(BRAND)
    expect('wemeditate.com').toMatch(BRAND)
  })

  // …and does not fire on the identifiers that are a published contract.
  it.each(['sahaj-atlas', 'sahaj-atlas-style', 'sy-atlas', 'atlas.sydevelopers.com'])(
    'leaves the identifier %s alone',
    (identifier) => {
      expect(identifier).not.toMatch(BRAND)
    },
  )
})
