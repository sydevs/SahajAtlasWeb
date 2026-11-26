import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, it, expect } from 'vitest'

import { List, ListRow } from './List'

// Node-only SSR assertions (see `docs/testing.md`). These pin the
// explicit class-level resets, which duplicate preflight on purpose —
// `List.tsx` carries why they are kept now that no host rule can reach
// the <ul> (#236).

const firstClasses = (html: string) => (html.match(/class="([^"]*)"/)?.[1] ?? '').split(' ')

describe('List', () => {
  it('renders a <ul> with explicit list resets, independent of preflight', () => {
    const html = renderToStaticMarkup(
      <List>
        <li>row</li>
      </List>,
    )
    const classes = firstClasses(html)

    expect(html).toMatch(/^<ul[\s>]/)
    expect(classes).toContain('list-none')
    expect(classes).toContain('m-0')
    expect(classes).toContain('p-0')
    // The li-level marker suppression. Preflight resets `ol, ul, menu`
    // and not `li`, so without this each <li> only inherits the reset
    // from the ul. SSR escapes the arbitrary-variant selector's & and >
    // in the attribute value.
    expect(classes).toContain('[&amp;&gt;li]:list-none')
  })

  describe('ListRow', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ListRow className="py-4" data-testid="row" href="/gb">
          content
        </ListRow>
      </MemoryRouter>,
    )

    it('nests as <li><a>, so each row is a valid direct child of the <ul> (#65)', () => {
      expect(html).toMatch(/^<li><a[\s>]/)
      expect(html.endsWith('</a></li>')).toBe(true)
    })

    it('centres its content beside the chevron, through the Link merge', () => {
      const row = firstClasses(html)

      expect(row).toEqual(expect.arrayContaining(['flex', 'items-center', 'px-gutter', 'py-4']))
      // The row's `flex` must beat the Link atom's `inline-flex`.
      expect(row).not.toContain('inline-flex')
      expect(html).toContain('data-testid="row"')
    })

    it('ends in a quiet chevron that mirrors in RTL', () => {
      const chevron = html.match(/<svg[^>]*class="([^"]*)"[^>]*>/)
      const classes = chevron?.[1].split(' ') ?? []

      expect(classes).toEqual(
        expect.arrayContaining(['lucide-chevron-right', 'text-gray-9', 'rtl:-scale-x-100']),
      )
      expect(chevron?.[0]).toContain('width="20"')
      expect(html).toMatch(/content<svg[\s\S]*<\/svg><\/a><\/li>$/)
    })
  })
})
