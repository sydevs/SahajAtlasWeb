import type { ReactElement } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi, afterEach } from 'vitest'

import { Link } from './Link'

// Node-only SSR assertions (see `.claude/rules/tests.md`). MemoryRouter supplies the
// router context the internal branch needs; the external branch is a plain <a> and needs
// none, but wrapping everything keeps the cases comparable.
//
// What this pins is the atom's scheme guard. `safePath` already screens the CMS-provided
// paths upstream, but this atom is the LAST gate before a data-driven string becomes an
// `<a href>` — so the guard has to hold on the atom's own terms, for every caller, and
// independently of how the caller asked the link to be rendered.
const render = (ui: ReactElement) => renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>)

// The refusal path calls `reportInternalError`, which logs. Silence it and assert on it.
// Match on our own prefix rather than the call count: MemoryRouter also emits React's
// "useLayoutEffect does nothing on the server" warning through the same channel.
const silenceReport = () => vi.spyOn(console, 'error').mockImplementation(() => {})

const refusals = (spy: ReturnType<typeof silenceReport>) =>
  spy.mock.calls.filter(([first]) => String(first).startsWith('[sahaj-atlas] Link'))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Link — scheme guard', () => {
  // The regression this locks down: `isExternal` / `target="_blank"` used to sit in the
  // same boolean as the scheme test, so either flag short-circuited it and a
  // `javascript:` href reached the plain <a> — where a click runs in the HOST page's
  // realm. Safety is now decided by the href alone, before the flags are read, so every
  // combination has to refuse.
  const flagCombinations = [
    { name: 'bare', props: {} },
    { name: 'isExternal', props: { isExternal: true } },
    { name: 'target="_blank"', props: { target: '_blank' } },
    { name: 'isExternal + target="_blank"', props: { isExternal: true, target: '_blank' } },
  ]

  it.each(flagCombinations)('refuses a javascript: href — $name', ({ props }) => {
    const spy = silenceReport()
    const html = render(
      <Link href="javascript:alert(1)" {...props}>
        Click me
      </Link>,
    )

    // No anchor at all, and the string never appears in the markup.
    expect(html).not.toContain('<a')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('href')
    // It degrades to plain text rather than vanishing — the failure is visible, not silent.
    expect(html).toContain('<span')
    expect(html).toContain('Click me')
    // And it is reported, so a caller feeding the atom bad data can be found.
    expect(refusals(spy)).toHaveLength(1)
  })

  it('refuses any other unknown scheme, and a bare fragment', () => {
    silenceReport()

    for (const href of ['data:text/html,<script>x</script>', 'vbscript:x', 'file:///etc', '#top']) {
      const html = render(<Link href={href}>x</Link>)

      expect(html).toContain('<span')
      expect(html).not.toContain('<a')
    }
  })
})

describe('Link — allowed schemes still render as before', () => {
  it.each(['https://example.com/', 'http://example.com/', 'mailto:a@example.com', 'tel:+4412345'])(
    'renders %s on a plain <a>',
    (href) => {
      const html = render(<Link href={href}>Go</Link>)

      expect(html).toContain(`href="${href}"`)
      expect(html).toMatch(/^<a[\s>]/)
      expect(html).toContain('Go')
    },
  )

  it('carries the safe rel + new tab when the caller asks for the external treatment', () => {
    for (const props of [{ isExternal: true }, { target: '_blank' as const }]) {
      const html = render(
        <Link href="https://example.com/" {...props}>
          Go
        </Link>,
      )

      expect(html).toContain('rel="noopener noreferrer"')
      expect(html).toContain('target="_blank"')
    }
  })

  it('adds no rel or target to a plain off-site link the caller did not flag', () => {
    const html = render(<Link href="https://example.com/">Go</Link>)

    expect(html).not.toContain('rel=')
    expect(html).not.toContain('target=')
  })
})

describe('Link — site-relative hrefs', () => {
  it('routes a site-relative href internally rather than refusing it', () => {
    const html = render(<Link href="/regions/france">France</Link>)

    expect(html).toContain('href="/regions/france"')
    expect(html).toContain('France')
    expect(html).not.toContain('<span')
  })

  it('lets a caller force the new-tab treatment on a site-relative href', () => {
    // `isExternal` still decides RENDERING — it just no longer decides safety. The
    // recovery ladder's country-site rung relies on this pairing.
    const html = render(
      <Link isExternal href="/gb">
        GB
      </Link>,
    )

    expect(html).toContain('href="/gb"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('target="_blank"')
  })
})
