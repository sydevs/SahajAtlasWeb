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

// The atom's href form is one of the app's three JSX anchors, and until #114 it was ungated
// — the `Link` atom's guard sits in a component this arm never reaches.
//
// The predicate's own case table lives in `src/lib/shape/href.test.ts` and is deliberately
// NOT repeated here: re-enumerating it per component is how the four copies drift, which is
// the failure this ticket exists to stop. What only this spec can prove is the WIRING — that
// the arm asks the predicate at all, how it degrades, and that the hrefs this atom really
// carries survive the gate.
describe('Button — href gate', () => {
  it('refuses an unsafe href — no anchor, and the string never reaches the markup', () => {
    const spy = silenceReport()
    const html = renderToStaticMarkup(<Button href="javascript:alert(1)">Go</Button>)

    expect(html).not.toContain('<a')
    expect(html).not.toContain('href=')
    // It degrades to the same content on a span — visibly present, not interactive.
    expect(html).toMatch(/^<span[\s>]/)
    expect(html).toContain('Go')
    // And it is reported, so a caller feeding the atom bad data can be found.
    expect(
      spy.mock.calls.filter(([message]) => String(message).startsWith('[sahaj-atlas] Button')),
    ).toHaveLength(1)
  })

  // One case from the protocol-relative family, because THAT is the one an anchor renders
  // verbatim while looking site-relative — the rest of the family is pinned in href.test.ts.
  it('refuses //evil.com rather than emitting it as a same-origin-looking route', () => {
    silenceReport()
    const html = renderToStaticMarkup(<Button href="//evil.com">Go</Button>)

    expect(html).not.toContain('evil.com')
  })

  // The hrefs this atom actually carries in production: the four calendar link-outs
  // (`lib/ics.ts`) and ReportIssueForm's contact address. Gating must not cost them.
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

  // The button arm is untouched by the gate — it has no href to judge.
  it('leaves the button arm alone', () => {
    const html = renderToStaticMarkup(<Button>Press</Button>)

    expect(html).toMatch(/^<button[\s>]/)
  })
})
