import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/atoms/Button'

// The refusal path calls `reportInternalError`, which logs. Silence it and match on our own
// prefix rather than the call count (mirrors Link.test.tsx).
const silenceReport = () => vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Button', () => {
  // Icon-only buttons sit in flex header rows next to long, shrinkable titles
  // (e.g. the EventView close button). Default flex-shrink squashed the fixed
  // square into a rectangle — the glyph stayed put but the hover surface no
  // longer matched. The atom must pin both the squared width and shrink-0.
  it('keeps icon-only buttons a fixed square under flex compression', () => {
    const html = renderToStaticMarkup(
      <Button isIconOnly aria-label="Close" size="sm" variant="ghost">
        x
      </Button>,
    )

    expect(html).toContain('shrink-0')
    expect(html).toContain('w-8')
  })

  it('leaves labeled buttons shrinkable', () => {
    const html = renderToStaticMarkup(<Button size="sm">Label</Button>)

    expect(html).not.toContain('shrink-0')
  })
})

// The atom's href form is one of the app's three anchors, and until #114 it was ungated —
// the `Link` atom's guard sits in a component this arm never reaches.
describe('Button — href gate', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>x</script>',
    'vbscript:x',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
  ])('refuses %j — renders no anchor and no href', (href) => {
    const spy = silenceReport()
    const html = renderToStaticMarkup(<Button href={href}>Go</Button>)

    // No anchor at all, and the string never reaches the markup.
    expect(html).not.toContain('<a')
    expect(html).not.toContain('href=')
    expect(html).not.toContain('evil.com')
    expect(html).not.toContain('javascript:')
    // It degrades to the same content on a span — visibly present, not interactive.
    expect(html).toContain('<span')
    expect(html).toContain('Go')
    // And it is reported, so a caller feeding the atom bad data can be found.
    expect(
      spy.mock.calls.filter(([message]) => String(message).startsWith('[sahaj-atlas] Button')),
    ).toHaveLength(1)
  })

  // The hrefs this atom actually carries in production: the four calendar link-outs
  // (`lib/ics.ts`) and ReportIssueForm's contact address. Gating must not cost them.
  it.each([
    'https://calendar.google.com/calendar/render?action=TEMPLATE',
    'https://outlook.live.com/calendar/0/deeplink/compose',
    'HTTPS://example.com/',
    'mailto:atlas@sydevelopers.com',
  ])('still renders %j as a real anchor', (href) => {
    const html = renderToStaticMarkup(<Button href={href}>Go</Button>)

    expect(html).toMatch(/^<a[\s>]/)
    expect(html).toContain(`href="${href.replace(/&/g, '&amp;')}"`)
    expect(html).not.toContain('<span')
  })

  it('keeps deriving the safe rel from target="_blank" on an allowed href', () => {
    const html = renderToStaticMarkup(
      <Button href="https://example.com/" target="_blank">
        Go
      </Button>,
    )

    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('target="_blank"')
  })

  // The button arm is untouched by the gate — it has no href to judge.
  it('leaves the button arm alone', () => {
    const html = renderToStaticMarkup(<Button>Press</Button>)

    expect(html).toMatch(/^<button[\s>]/)
  })
})
