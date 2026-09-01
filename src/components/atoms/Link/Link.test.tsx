import type { ReactElement } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi, afterEach } from 'vitest'

import { Link } from './Link'

// Node-only SSR assertions (see `docs/testing.md`). MemoryRouter supplies the
// router context the internal branch needs; the external branch is a plain <a> and needs
// none, but wrapping everything keeps the cases comparable.
const render = (ui: ReactElement) => renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>)

// The refusal path calls `reportInternalError`, which logs. Silence it, and match on our
// own prefix rather than the call count: MemoryRouter also emits React's "useLayoutEffect
// does nothing on the server" warning through the same channel.
const silenceReport = () => vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Link — scheme guard', () => {
  // Safety is decided by the href alone, before the flags are read (see Link.tsx), so
  // every flag combination has to refuse the same href.
  it.each([
    { name: 'bare', props: {} },
    { name: 'isExternal', props: { isExternal: true } },
    { name: 'target="_blank"', props: { target: '_blank' } },
    { name: 'isExternal + target="_blank"', props: { isExternal: true, target: '_blank' } },
  ])('refuses a javascript: href — $name', ({ props }) => {
    const spy = silenceReport()
    const html = render(
      <Link href="javascript:alert(1)" {...props}>
        Click me
      </Link>,
    )

    // No anchor at all, and the string never appears in the markup.
    expect(html).not.toContain('<a')
    expect(html).not.toContain('javascript:')
    // It degrades to plain text rather than vanishing — the failure is visible, not silent.
    expect(html).toContain('<span')
    expect(html).toContain('Click me')
    // And it is reported, so a caller feeding the atom bad data can be found.
    expect(
      spy.mock.calls.filter(([message]) => String(message).startsWith('[sahaj-atlas] Link')),
    ).toHaveLength(1)
  })

  it.each(['data:text/html,<script>x</script>', 'vbscript:x', 'file:///etc', '#top'])(
    'refuses %s — not site-relative, not an allowed scheme',
    (href) => {
      silenceReport()
      const html = render(<Link href={href}>x</Link>)

      expect(html).toContain('<span')
      expect(html).not.toContain('<a')
    },
  )

  // "Site-relative" is `safePath`, not a leading slash. `//evil.com` is the one that
  // bites: react-router treats a `//` prefix as absolute, renders it verbatim and drops
  // its click interception, so a left-click navigates the HOST page off-origin. The
  // backslash and TAB/LF/CR forms are the strings the WHATWG parser rewrites into that.
  it.each(['//evil.com', '/\\evil.com', '/\t/evil.com', '/\n\\evil.com', '/\r/evil.com'])(
    'refuses %j — passes a leading-slash test but is not a same-origin route',
    (href) => {
      silenceReport()
      const html = render(<Link href={href}>x</Link>)

      expect(html).toContain('<span')
      expect(html).not.toContain('<a')
      expect(html).not.toContain('evil.com')
    },
  )
})

describe('Link — allowed schemes still render as before', () => {
  // `HTTPS:` is in the list because the two upstream guards that feed this atom
  // (`SafeUrlSchema`, `validateWebUrl`) are case-insensitive: a case-sensitive test here
  // would refuse a URL they already passed and silently degrade the link to text.
  it.each([
    'https://example.com/',
    'http://example.com/',
    'HTTPS://example.com/',
    'mailto:a@example.com',
    'tel:+4412345',
  ])('renders %s on a plain <a>, with no rel or target the caller did not ask for', (href) => {
    const html = render(<Link href={href}>Go</Link>)

    expect(html).toMatch(/^<a[\s>]/)
    expect(html).toContain(`href="${href}"`)
    expect(html).toContain('Go')
    expect(html).not.toContain('rel=')
    expect(html).not.toContain('target=')
  })

  it.each([{ isExternal: true }, { target: '_blank' as const }])(
    'carries the safe rel + new tab when the caller asks for the external treatment (%o)',
    (props) => {
      const html = render(
        <Link href="https://example.com/" {...props}>
          Go
        </Link>,
      )

      expect(html).toContain('rel="noopener noreferrer"')
      expect(html).toContain('target="_blank"')
    },
  )
})

describe('Link — site-relative hrefs', () => {
  it('routes a site-relative href internally rather than refusing it', () => {
    const html = render(<Link href="/regions/france">France</Link>)

    expect(html).toContain('href="/regions/france"')
    expect(html).toContain('France')
    expect(html).not.toContain('<span')
  })

  it('does not refuse a site-relative href just because a flag is set', () => {
    // The guard must not have become stricter: a flag on an internal path still yields a
    // link, not the refusal span. Only that much is pinned here.
    //
    // What this case deliberately does NOT bless is the resulting markup. No caller pairs
    // `isExternal` with a site-relative href today (every one passes an absolute URL), and
    // the pairing is questionable on its own terms — it renders a plain
    // `<a href="/gb" target="_blank">`, which resolves
    // against the HOST page, exactly what `OnwardLink` warns about. Making that route
    // internally is a behaviour change and belongs in its own ticket.
    const html = render(
      <Link isExternal href="/gb">
        GB
      </Link>,
    )

    expect(html).toContain('href="/gb"')
    expect(html).not.toContain('<span')
  })
})
