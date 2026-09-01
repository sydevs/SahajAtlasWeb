import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { LoadMore } from './LoadMore'

// Mock the i18n boundary (react-i18next) so the SSR markup asserts on real copy —
// including the Ruby-style `%{}` interpolation — without booting i18next. Node lane,
// no jsdom (see docs/testing.md).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { shown?: number; total?: number }) =>
      ({
        'results.more': 'Show more',
        'results.farther': 'Show distant events',
        'results.showing': `Showing ${opts?.shown} of ${opts?.total} events`,
      })[key] ?? key,
    i18n: { resolvedLanguage: 'en', on: () => {}, off: () => {} },
  }),
}))

const render = (props: Partial<Parameters<typeof LoadMore>[0]> = {}) =>
  renderToStaticMarkup(
    <LoadMore announce={false} more="more" shown={25} total={137} onReveal={() => {}} {...props} />,
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
    expect(render({ more: 'farther' })).toContain('Show distant events')
  })

  it('keeps saying "distant" for pages after the boundary, never reverting to "more"', () => {
    // The parent hands back `'farther'` for every page once the distant segment is
    // showing, so this is the label that has to survive repeated presses.
    expect(render({ more: 'farther', shown: 97, total: 330 })).toContain('Show distant events')
  })

  it('marks itself busy while a reveal renders, but never disabled', () => {
    // `disabled` would unfocus the button for the commit the flag is up, dropping a
    // keyboard user to <body> — and re-enabling doesn't bring focus back, so every
    // press would silently cost them their place. The parent's `pending` guard is what
    // makes a second press a no-op; nothing needs disabling to stay correct.
    const html = render({ loading: true })

    expect(html).toContain('aria-busy="true"')
    // The rendered ATTRIBUTE (`disabled=""`), not the substring — the class list
    // carries Tailwind's `disabled:` variants either way.
    expect(html).not.toMatch(/\sdisabled=/)
  })

  it('renders the same static markup whether or not auto-reveal is armed', () => {
    // `auto` only wires an IntersectionObserver in an effect, so the button it observes
    // must exist identically without one — the keyboard/screen-reader path can never
    // depend on a scroll event firing.
    expect(render({ auto: true })).toBe(render({ auto: false }))
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
