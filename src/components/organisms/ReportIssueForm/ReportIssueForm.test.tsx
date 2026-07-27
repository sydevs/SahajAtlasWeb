import type { ReportContext } from '@/lib/report'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ReportIssueForm } from './ReportIssueForm'

// Mock the i18n boundary so the SSR markup asserts on real copy without booting
// i18next. `i18n` is stubbed too — useLocale (reached through useTurnstile) subscribes
// to it. Node lane, no jsdom (see .claude/rules/tests.md).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { min?: number }) =>
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

describe('ReportIssueForm', () => {
  it('renders a required message field and an optional email with its reply caveat', () => {
    const html = renderToStaticMarkup(<ReportIssueForm context={context} onClose={noop} />)

    expect(html).toContain('What went wrong?')
    // The message carries the required marker; the email deliberately does not.
    expect(html).toContain('What went wrong? *')
    expect(html).toContain('Email')
    expect(html).not.toContain('Email *')
    expect(html).toContain('Optional — we can only reply if you leave one.')
  })

  it('starts with submit disabled — there is no message and no captcha token yet', () => {
    const html = renderToStaticMarkup(<ReportIssueForm context={context} onClose={noop} />)

    expect(html).toContain('Send report')
    // The real attribute, not the `disabled:` Tailwind classes every Button carries.
    expect(html).toContain('disabled=""')
  })

  it('degrades to a mailto route instead of a dead submit when the captcha is blocked', () => {
    const html = renderToStaticMarkup(
      <ReportIssueForm captchaUnavailable context={context} onClose={noop} />,
    )

    // SSR escapes the apostrophe, so match the part of the sentence that survives verbatim.
    expect(html).toContain('The security check couldn')
    expect(html).toContain('t load, so this form can')
    expect(html).toContain('mailto:contact@sydevelopers.com')
    expect(html).not.toContain('Send report')
  })

  it('replaces the form with the thank-you state once submitted', () => {
    const html = renderToStaticMarkup(
      <ReportIssueForm initialSubmitted context={context} onClose={noop} />,
    )

    expect(html).toContain('Thank you — your report is on its way to the team.')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Send report')
  })
})
