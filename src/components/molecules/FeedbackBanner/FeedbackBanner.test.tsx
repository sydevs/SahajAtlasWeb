import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { FeedbackBanner } from './FeedbackBanner'

// Mock the i18n boundary so the SSR markup asserts on REAL copy rather than key names — the
// copy is the substance of this component, and half the assertions below are about what it
// does and does not say. Node lane, no jsdom (see .claude/rules/tests.md).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'feedback.confirmed':
          'Thanks for confirming — this helps other seekers know this class is real.',
        'feedback.denied': 'Thanks for letting us know — sorry you had a wasted journey.',
        'feedback.nearby': 'See other classes nearby',
      })[key] ?? key,
  }),
}))

// The `Link` atom is client-routed, so it needs a Router in context (the idiom ListItem and
// EventListItem use).
const render = (ui: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>)

describe('FeedbackBanner', () => {
  it('thanks a confirming reader and says why it helped', () => {
    const html = render(<FeedbackBanner answer="confirmed" />)

    expect(html).toContain('Thanks for confirming')
    expect(html).toContain('other seekers')
  })

  it('leads a denial with the wasted journey, before anything else', () => {
    const html = render(<FeedbackBanner answer="denied" />)

    expect(html).toContain('Thanks for letting us know')
    expect(html).toContain('sorry you had a wasted journey')
  })

  /**
   * The copy constraint the ticket calls out by name: one report is not a verdict. The listing
   * only comes down at five denials with a Wilson upper bound below 0.5, so nothing here may
   * tell the reader the class is fake, gone, or removed.
   */
  it('never tells a denying reader the listing was fake or has been taken down', () => {
    const html = render(<FeedbackBanner answer="denied" />).toLowerCase()

    for (const verdict of ['fake', 'removed', 'deleted', 'does not exist', "doesn't exist"]) {
      expect(html).not.toContain(verdict)
    }
  })

  /**
   * The fifth denial unpublishes the event, so the region a denying reader is redirected to can
   * legitimately have nothing left to list. A banner promising classes below it would then sit
   * directly above an empty state.
   */
  it('promises nothing about what is underneath it', () => {
    const html = render(<FeedbackBanner answer="denied" />).toLowerCase()

    expect(html).not.toContain('here are')
    expect(html).not.toContain('below')
  })

  it('offers the onward rung as a real link when given one', () => {
    const html = render(<FeedbackBanner answer="confirmed" onwardHref="/gb/london" />)

    expect(html).toContain('href="/gb/london"')
    expect(html).toContain('See other classes nearby')
  })

  // On the region page the list below IS the onward step; a link would send the reader to the
  // page they are already on.
  it('renders no onward link when none is given', () => {
    const html = render(<FeedbackBanner answer="denied" />)

    expect(html).not.toContain('See other classes nearby')
    expect(html).not.toContain('<a')
  })

  it('announces politely — it reports something the reader did, not a problem', () => {
    for (const answer of ['confirmed', 'denied'] as const) {
      const html = render(<FeedbackBanner answer={answer} />)

      expect(html).toContain('role="status"')
      expect(html).not.toContain('role="alert"')
      // Never the fixed status red: an acknowledgement is not a failure.
      expect(html).not.toContain('bg-danger-3')
    }
  })

  it('aligns with the drawer header, like the other banner above a list', () => {
    expect(render(<FeedbackBanner answer="confirmed" />)).toContain('px-4')
  })
})
