import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ActionCircle } from './ActionRow'

// The refusal path calls `reportInternalError`, which logs. Silence it and match on our own
// prefix rather than the call count (mirrors Link.test.tsx).
const silenceReport = () => vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  vi.restoreAllMocks()
})

// ActionCircle is the third of the app's three JSX anchors and, until #114, the second of
// the two that rendered a raw `<a href>` with no gate of their own.
//
// As in Button.test.tsx, the predicate's case table stays in `src/lib/shape/href.test.ts`.
// This spec proves the wiring and the hrefs this row really carries.
describe('ActionCircle — href gate', () => {
  // Refusing must not silently promote the action to a focusable control that does nothing —
  // that is a worse dead end for a keyboard user than inert content.
  it('refuses an unsafe href, degrading to a non-interactive span and not the button arm', () => {
    const spy = silenceReport()
    const html = renderToStaticMarkup(
      <ActionCircle href="javascript:alert(1)" icon={<svg />} label="Contact" />,
    )

    expect(html).not.toContain('<a')
    expect(html).not.toContain('href=')
    expect(html).toMatch(/^<span[\s>]/)
    expect(html).not.toContain('<button')
    // The label survives, so the refusal is visible rather than a hole in the row.
    expect(html).toContain('Contact')
    expect(
      spy.mock.calls.filter(([message]) =>
        String(message).startsWith('[sahaj-atlas] ActionCircle'),
      ),
    ).toHaveLength(1)
  })

  it('refuses //evil.com rather than emitting it as a same-origin-looking route', () => {
    silenceReport()
    const html = renderToStaticMarkup(
      <ActionCircle href="//evil.com" icon={<svg />} label="Contact" />,
    )

    expect(html).not.toContain('evil.com')
  })

  // Its one production caller passes exactly three shapes: a `directionsUrl` we build, a
  // `SafeUrlSchema`-parsed `event.website`, and a literal `tel:`. A gate that broke the phone
  // link would be worse than no gate at all.
  it.each([
    'https://www.google.com/maps/search/?api=1&query=51.5,-0.12',
    'https://example.org/',
    'tel:+441234567890',
  ])('still renders %j as a real anchor', (href) => {
    const html = renderToStaticMarkup(<ActionCircle href={href} icon={<svg />} label="Go" />)

    expect(html).toMatch(/^<a[\s>]/)
    expect(html).toContain(`href="${href.replace(/&/g, '&amp;')}"`)
  })

  it('keeps the external treatment on an allowed href', () => {
    const html = renderToStaticMarkup(
      <ActionCircle isExternal href="https://example.org/" icon={<svg />} label="Website" />,
    )

    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('target="_blank"')
  })

  // No href to judge — the gate must not touch the button arm the desktop contact popover
  // anchors to.
  it('leaves the hrefless button arm alone', () => {
    const html = renderToStaticMarkup(<ActionCircle icon={<svg />} label="Share" />)

    expect(html).toMatch(/^<button[\s>]/)
    expect(html).toContain('Share')
  })
})
