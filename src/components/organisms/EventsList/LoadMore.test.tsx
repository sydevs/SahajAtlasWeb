import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { LoadMore } from './LoadMore'

// Mock the i18n boundary (react-i18next) so the SSR markup asserts on real copy —
// including the Ruby-style %{km} interpolation — without booting i18next. Node lane,
// no jsdom (see .claude/rules/tests.md).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { km?: number; shown?: number; total?: number }) =>
      ({
        'results.more': 'Show more',
        'results.farther': `Show events farther than ${opts?.km} km`,
        'results.showing': `Showing ${opts?.shown} of ${opts?.total} events`,
      })[key] ?? key,
    i18n: { resolvedLanguage: 'en', on: () => {}, off: () => {} },
  }),
}))

const render = (props: Partial<Parameters<typeof LoadMore>[0]> = {}) =>
  renderToStaticMarkup(
    <LoadMore
      announce={false}
      km={500}
      more="more"
      shown={25}
      total={137}
      onReveal={() => {}}
      {...props}
    />,
  )

describe('LoadMore', () => {
  it('renders a real button while matches remain', () => {
    const html = render({ more: 'more' })

    expect(html).toContain('<button')
    expect(html).toContain('Show more')
  })

  it('says plainly what the boundary crossing does', () => {
    // The list's only distance affordance — it has to read as "nearby events have run
    // out", not as the list simply ending.
    expect(render({ more: 'farther' })).toContain('Show events farther than 500 km')
  })

  it('drops the button once everything is revealed', () => {
    const html = render({ more: null, announce: true })

    expect(html).not.toContain('<button')
    // The live region survives the button it sat beside — the LAST press is the one
    // that unmounts the control, and its announcement has to outlive it.
    expect(html).toContain('role="status"')
    expect(html).toContain('Showing 25 of 137 events')
  })

  it('announces politely rather than interrupting', () => {
    const html = render({ announce: true })

    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('role="status"')
    expect(html).toContain('sr-only')
  })

  it('stays silent until something has actually been revealed', () => {
    const html = render({ announce: false })

    expect(html).toContain('role="status"')
    expect(html).not.toContain('Showing')
  })
})
