import type { ReactElement } from 'react'
import type { ReportContext } from '@/lib/report'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ReportIssueForm } from './ReportIssueForm'

import { REPORT_MESSAGE_MAX } from '@/types/report'

// The SDK is stubbed at the boundary so importing the form's `api` module can't reach a
// network client (the submit path itself is covered in `config/api/mutate.test.ts`), and
// `@/config/i18n` so that import doesn't boot the real HTTP backend.
vi.mock('@payloadcms/sdk', () => ({
  PayloadSDK: class {
    request = vi.fn()
  },
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))

// Mock the i18n boundary so the SSR markup asserts on real copy without booting
// i18next. `i18n` is stubbed too — useLocale (reached through useTurnstile) subscribes
// to it. Node lane, no jsdom (see docs/testing.md).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { min?: number; email?: string }) =>
      ({
        close: 'Close',
        'report.message_label': 'What went wrong?',
        'report.message_placeholder': 'Describe what you were doing and what looked wrong.',
        'report.email_label': 'Email',
        'report.email_help': 'Optional — we can only reply if you leave one.',
        'report.email_placeholder': 'you@example.com',
        'report.submit': 'Send report',
        'report.cancel': 'Cancel',
        'report.sent': 'Thank you — your report is on its way to the team.',
        'report.blocked': "The security check couldn't load, so this form can't be sent.",
        'report.errors.message': `Please write at least ${opts?.min} characters.`,
        // No `report.errors.captcha`: reaching that branch needs a REJECTED mutation, and
        // the node lane renders SSR markup once — `initialFailed` can only stage the
        // generic failure. The branch is a compile-time total Record over the synced code
        // union, and the copy itself is covered by the locale-parity gate.
        // No interpolation any more: this sentence used to end "…or email us at %{email}",
        // which is the `mailto:` escape issue #182 removed. It now tells the viewer to
        // retry, and names no inbox.
        'report.errors.send_failed': `Your report wasn't sent. Wait for the security check to refresh, then try again.`,
      })[key] ?? key,
    i18n: { on: () => {}, off: () => {}, resolvedLanguage: 'en' },
  }),
}))

const context: ReportContext = {
  path: '/india/pune/e/42',
  pageUrl: 'https://host.example/classes',
  locale: 'en',
  userAgent: 'TestAgent/1.0',
}

const noop = () => {}

// The form owns a `useMutation` now, so it needs a client in scope. One per render keeps
// the specs independent.
const render = (ui: ReactElement) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

describe('ReportIssueForm', () => {
  it('renders a required message field and an optional email with its reply caveat', () => {
    const html = render(<ReportIssueForm context={context} onClose={noop} />)

    expect(html).toContain('What went wrong?')
    // The message carries the required marker; the email deliberately does not.
    expect(html).toContain('What went wrong? *')
    expect(html).toContain('Email')
    expect(html).not.toContain('Email *')
    expect(html).toContain('Optional — we can only reply if you leave one.')
  })

  it('announces the email caveat and caps the message at the schema ceiling', () => {
    const html = render(<ReportIssueForm context={context} onClose={noop} />)

    // The help line is addressable, not just visible — an SR user hears the caveat.
    expect(html).toContain('id="report-email-help"')
    expect(html).toContain('aria-describedby="report-email-help"')
    // A hard stop, so pasting a long stack trace can't leave submit silently disabled
    // under a "write at least 10 characters" message.
    // Case-insensitive: react-dom/server emits the prop name verbatim (`maxLength`),
    // while the browser parses it as the lowercase `maxlength` attribute.
    expect(html).toMatch(new RegExp(`maxlength="${REPORT_MESSAGE_MAX}"`, 'i'))
    expect(html).toContain('aria-required="true"')
  })

  it('starts with submit disabled — there is no message and no captcha token yet', () => {
    const html = render(<ReportIssueForm context={context} onClose={noop} />)

    expect(html).toContain('Send report')
    // The real attribute, not the `disabled:` Tailwind classes every Button carries.
    expect(html).toContain('disabled=""')
  })

  // The degradation this replaces put `contact@sydevelopers.com` on screen as a `mailto:` —
  // on any host page whose CSP blocked the challenge, which is to say published to every
  // scraper reading those pages (issue #182). A blocked captcha now fails the whole widget
  // at `useTurnstileGuard`, so this state is only reachable for the two failures the eager
  // probe cannot see (a `frame-src` block, an unregistered domain) and the form's job there
  // is to explain the dead button, not to route around it.
  it('says why the submit is dead when the captcha is blocked, and names no inbox', () => {
    const html = render(<ReportIssueForm captchaUnavailable context={context} onClose={noop} />)

    // SSR escapes the apostrophe, so match the part of the sentence that survives verbatim.
    expect(html).toContain('The security check couldn')
    expect(html).toContain('t load, so this form can')
    // The submit stays — disabled, because there is no token — rather than being swapped
    // for an escape hatch.
    expect(html).toContain('Send report')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('sydevelopers.com')
  })

  it('replaces the form with the thank-you state once submitted', () => {
    const html = render(<ReportIssueForm initialSubmitted context={context} onClose={noop} />)

    expect(html).toContain('Thank you — your report is on its way to the team.')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Send report')
  })

  it('says a failed send failed, and keeps the form so it can be retried', () => {
    const html = render(<ReportIssueForm initialFailed context={context} onClose={noop} />)

    // The whole point of issue #103: before this, submit alerted the payload and showed
    // the thank-you screen regardless, so a report that reached nobody read as delivered.
    expect(html).not.toContain('Thank you')
    expect(html).toContain('t sent. Wait for the security check to refresh')
    // No inbox on screen. The sentence used to carry `contact@sydevelopers.com` so a
    // viewer whose POST failed had a route that still worked; #182 removed it, because
    // the same string rendered on every host page whose CSP blocked the challenge.
    expect(html).not.toContain('sydevelopers.com')
    // The typed message survives the failure: the fields are still mounted.
    expect(html).toContain('<textarea')
    expect(html).toContain('Send report')
  })

  it('renders the failure as an assertive alert', () => {
    const html = render(<ReportIssueForm initialFailed context={context} onClose={noop} />)

    // Tie the role to THIS sentence: a bare `role="alert"` is also satisfied by the
    // captcha-blocked banner and by FormField's own error span, so the loose assertion
    // would pass with the failure alert deleted.
    expect(html).toMatch(/role="alert"[^>]*>(?:(?!<\/div>).)*?wasn(?:&#x27;|')t sent/s)
  })
})
