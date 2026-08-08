import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { hasAllowedScheme, isSafeHref } from './href'

// The sink-level gate for every caller-supplied `<a href>` in the app (issue #114). These
// cases are the reason the predicate is one function in one place: each recurrence it
// guards against was a check that looked correct at the call site it was written for.

describe('isSafeHref — refuses', () => {
  // Executable schemes. `javascript:` is the one that matters most — the widget renders
  // inside a host page, so it would run in THEIR realm — but the rest are refused for the
  // same reason: nothing outside the three allowed schemes has a reason to reach an href.
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>x</script>',
    'vbscript:x',
    'file:///etc/passwd',
    'blob:https://example.com/1234',
  ])('%j — not site-relative, not an allowed scheme', (href) => {
    expect(isSafeHref(href)).toBe(false)
  })

  // A bare fragment is not a route this app can serve. It is listed because it reads as
  // harmless and so is the likeliest thing to get quietly waved through.
  it.each(['#top', '', ' ', 'example.com', './relative', '../up'])(
    '%j — not a path and not a URL',
    (href) => {
      expect(isSafeHref(href)).toBe(false)
    },
  )

  // The whole point of reusing `safePath`. Each of these passes an `href.startsWith('/')`
  // test — the exact check #100 found `//evil.com` walking through — and each resolves
  // off-origin. The TAB/LF/CR forms are the non-obvious ones: the WHATWG URL parser strips
  // those characters BEFORE parsing, so they are read as `//evil.com`.
  it.each(['//evil.com', '/\\evil.com', '/\t/evil.com', '/\n\\evil.com', '/\r/evil.com'])(
    '%j — passes a leading-slash test but is not a same-origin route',
    (href) => {
      expect(isSafeHref(href)).toBe(false)
    },
  )

  // The anchors gated by this predicate render inside the error fallback, where a throw
  // would blank the widget on a host page. Refusing must never be the same as failing.
  it.each([null, undefined, 123, {}, () => '/gb'])(
    'a non-string (%p) returns false rather than throwing',
    (href) => {
      expect(() => isSafeHref(href)).not.toThrow()
      expect(isSafeHref(href)).toBe(false)
    },
  )
})

describe('isSafeHref — allows', () => {
  // `HTTPS:` is load-bearing, not padding. The two upstream guards feeding these anchors
  // (`SafeUrlSchema`, `validateWebUrl`) are case-insensitive, so a case-sensitive test here
  // would refuse a URL they already passed and silently degrade a valid link to text.
  it.each([
    'https://example.com/',
    'http://example.com/',
    'HTTPS://example.com/',
    'MailTo:a@example.com',
    'mailto:a@example.com',
    'tel:+441234567890',
  ])('%j — an allowed scheme', (href) => {
    expect(isSafeHref(href)).toBe(true)
  })

  it.each(['/', '/gb/london', '/search?center=1,2', '/gb/london/507#section'])(
    '%j — a site-relative route',
    (href) => {
      expect(isSafeHref(href)).toBe(true)
    },
  )

  // The hrefs that actually reach the two anchors this ticket gated. A predicate that broke
  // any of these would be worse than the status quo it replaced, so they are pinned here in
  // the shape their producers emit rather than left to the components' specs.
  it.each([
    // `directionsUrl` (`lib/events.ts`) — the ActionCircle directions action.
    'https://www.google.com/maps/search/?api=1&query=51.5,-0.12',
    // `buildGoogleCalendarUrl` (`lib/ics.ts`) — a Button link-out.
    'https://calendar.google.com/calendar/render?action=TEMPLATE',
    // ReportIssueForm's contact Button.
    'mailto:atlas@sydevelopers.com',
    // EventActions' contact circle, and the Fallbacks contact Link.
    'tel:+4402012345678',
  ])('%j — a real production href keeps working', (href) => {
    expect(isSafeHref(href)).toBe(true)
  })
})

describe('hasAllowedScheme', () => {
  // A rendering question, not a safety one — it is what tells the `Link` atom to emit a
  // plain `<a>` rather than routing through react-router. Pinned separately so nobody
  // "simplifies" the two into one: a site-relative path is safe but is NOT a scheme, and
  // swapping this in for the gate would refuse every internal route in the app.
  it('is false for a site-relative path that isSafeHref allows', () => {
    expect(hasAllowedScheme('/gb/london')).toBe(false)
    expect(isSafeHref('/gb/london')).toBe(true)
  })

  it('is true only for the three allowed schemes', () => {
    expect(hasAllowedScheme('https://example.com/')).toBe(true)
    expect(hasAllowedScheme('mailto:a@example.com')).toBe(true)
    expect(hasAllowedScheme('tel:+44')).toBe(true)
    expect(hasAllowedScheme('javascript:alert(1)')).toBe(false)
  })

  it('takes a non-string safely, like the gate it shares a regex with', () => {
    expect(hasAllowedScheme(null)).toBe(false)
    expect(hasAllowedScheme(undefined)).toBe(false)
  })
})

// A predicate only helps the anchors that call it, and the failure this ticket exists to stop
// is a FOURTH anchor being added that doesn't. The acceptance criteria for #114 spell that as
// a manual grep ("grep for `<a` under src/components finds no anchor rendering an unguarded
// caller-supplied href"); a grep nobody re-runs is how the first three recurrences happened,
// so it is executable here instead. Precedent: `config/i18n-options.test.ts` pins the locale
// directories the same way.
describe('the JSX anchor inventory', () => {
  const srcDir = fileURLToPath(new URL('../../', import.meta.url))

  // Only `.tsx` — JSX is the sink this predicate guards. `lexicalToHtml` (`lexical.ts`) also
  // emits `<a href>`, but as an HTML *string* sanitized by DOMPurify downstream: a different
  // sink with a different mechanism, deliberately out of this inventory.
  const sources = readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.tsx') &&
        !entry.name.includes('.test.') &&
        !entry.name.includes('.stories.'),
    )
    .map((entry) => `${entry.parentPath}/${entry.name}`.slice(srcDir.length))

  it('finds source files to scan (the walk itself must not silently break)', () => {
    expect(sources.length).toBeGreaterThan(50)
  })

  it('is exactly the three components that call isSafeHref', () => {
    const withAnchor = sources.filter((relative) => {
      const source = readFileSync(`${srcDir}${relative}`, 'utf8')
        // Prose mentioning `<a>` is not an anchor. Block comments carry most of it in this
        // repo; whole-line `//` comments carry the rest.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')

      return /<a[\s>]/.test(source)
    })

    // If this fails with a FOURTH file, that file renders an anchor: route its href through
    // `isSafeHref` (`lib/shape/href.ts`) and add it here. Don't just add it here.
    expect(withAnchor.sort()).toEqual([
      'components/atoms/Button/Button.tsx',
      'components/atoms/Link/Link.tsx',
      'components/molecules/ActionRow/ActionRow.tsx',
    ])
  })

  it('has every one of them calling the shared gate', () => {
    for (const relative of [
      'components/atoms/Button/Button.tsx',
      'components/atoms/Link/Link.tsx',
      'components/molecules/ActionRow/ActionRow.tsx',
    ]) {
      expect(readFileSync(`${srcDir}${relative}`, 'utf8')).toContain('isSafeHref(')
    }
  })
})
