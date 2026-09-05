import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/atoms/Button'

// The refusal path calls `reportInternalError`, which logs. Silence it. Match
// on our own prefix, not the call count. This mirrors Link.test.tsx.
const silenceReport = () => vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Button', () => {
  // Icon-only buttons sit in flex header rows next to long, shrinkable titles,
  // such as the EventView close button. The default flex-shrink squashed the
  // fixed square into a rectangle. The glyph stayed in place, but the hover
  // surface no longer matched it. The atom must pin both the squared width and
  // shrink-0.
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

// The atom's href form is one of the app's three JSX anchors. Until #114 it was
// ungated. The `Link` atom's guard sits in a component this arm never reaches.
//
// The predicate's own case table lives in `src/lib/shape/href.test.ts`. This spec
// deliberately does NOT repeat it. Re-listing the cases per component is how the
// four copies would drift, and stopping that drift is this ticket's whole point.
// This spec proves only the WIRING: that the arm asks the predicate at all, how
// it degrades, and that the hrefs this atom really carries survive the gate.
describe('Button — href gate', () => {
  it('refuses an unsafe href — no anchor, and the string never reaches the markup', () => {
    const spy = silenceReport()
    const html = renderToStaticMarkup(<Button href="javascript:alert(1)">Go</Button>)

    expect(html).not.toContain('<a')
    expect(html).not.toContain('href=')
    // It degrades to the same content on a span. The content stays visible, but
    // not interactive.
    expect(html).toMatch(/^<span[\s>]/)
    expect(html).toContain('Go')
    // It is also reported, so a review can trace bad data back to its caller.
    expect(
      spy.mock.calls.filter(([message]) => String(message).startsWith('[sahaj-atlas] Button')),
    ).toHaveLength(1)
  })

  // This tests one case from the protocol-relative family. An anchor renders
  // THAT case verbatim, while it still looks site-relative. The rest of the
  // family is pinned in href.test.ts.
  it('refuses //evil.com rather than emitting it as a same-origin-looking route', () => {
    silenceReport()
    const html = renderToStaticMarkup(<Button href="//evil.com">Go</Button>)

    expect(html).not.toContain('evil.com')
  })

  // These are the hrefs this atom actually carries in production: the four
  // calendar link-outs (`lib/ics.ts`) and ReportIssueForm's contact address. The
  // gate must not block them.
  it.each([
    'https://calendar.google.com/calendar/render?action=TEMPLATE',
    'https://outlook.live.com/calendar/0/deeplink/compose',
    'mailto:atlas@sydevelopers.com',
  ])('still renders %j as a real anchor', (href) => {
    const html = renderToStaticMarkup(<Button href={href}>Go</Button>)

    expect(html).toMatch(/^<a[\s>]/)
    expect(html).toContain(`href="${href}"`)
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

  // The gate never touches the button arm. It has no href to judge.
  it('leaves the button arm alone', () => {
    const html = renderToStaticMarkup(<Button>Press</Button>)

    expect(html).toMatch(/^<button[\s>]/)
  })
})
