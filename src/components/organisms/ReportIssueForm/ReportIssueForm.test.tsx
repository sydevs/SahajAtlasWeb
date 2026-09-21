import type { ReactElement } from 'react'
import type { ReportContext } from '@/lib/report'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ReportIssueForm } from './ReportIssueForm'

import { mockReportForm, mockRichReportForm } from '@/mocks/report-form'
import { REPORT_MESSAGE_MAX } from '@/types/report'

// The SDK is stubbed at the boundary, so importing the form's `api` module
// cannot reach a network client. The submit path itself is covered in
// `config/api/mutate.test.ts`. `@/config/i18n` is also stubbed, so that
// import does not boot the real HTTP backend.
vi.mock('@payloadcms/sdk', () => ({
  PayloadSDK: class {
    request = vi.fn()
  },
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))

// This mocks the i18n boundary, so the SSR markup asserts on real copy
// without booting i18next. `i18n` is stubbed too, since useLocale (reached
// through useTurnstile) subscribes to it. This runs in the node lane, with
// no jsdom (see docs/testing.md).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { min?: number; email?: string }) =>
      ({
        close: 'Close',
        'common.report.submit': 'Send report',
        'common.report.message_label': 'What went wrong?',
        'common.report.message_placeholder': 'Describe what you were doing and what looked wrong.',
        'common.report.email_label': 'Email',
        'common.report.email_help': 'Optional — we can only reply if you leave one.',
        'common.report.email_placeholder': 'you@example.com',
        'common.chrome.cancel': 'Cancel',
        'common.report.sent': 'Thank you — your report is on its way to the team.',
        'common.report.blocked': "The security check couldn't load, so this form can't be sent.",
        'common.report_errors.message': `Please write at least ${opts?.min} characters.`,
        // This has no `common.report_errors.captcha` entry. Reaching that branch
        // needs a REJECTED mutation, and the node lane renders SSR markup
        // once, so `initialFailed` can only stage the generic failure. The
        // branch is a compile-time total Record over the synced code union,
        // and the copy itself is covered by the locale-parity gate.
        // This has no interpolation any more. This sentence used to end
        // "…or email us at %{email}," which is the `mailto:` escape issue
        // #182 removed. It now tells the viewer to retry, and names no
        // inbox.
        'common.report_errors.send_failed': `Your report wasn't sent. Wait for the security check to refresh, then try again.`,
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

const form = (over: Partial<Parameters<typeof ReportIssueForm>[0]> = {}) => (
  <ReportIssueForm context={context} form={mockReportForm} onClose={noop} {...over} />
)

describe('ReportIssueForm', () => {
  it('renders the authored labels and the required marker the operator set', () => {
    const html = render(form())

    expect(html).toContain('What went wrong?')
    // The message carries the required marker. The email deliberately does not.
    expect(html).toContain('What went wrong? *')
    expect(html).toContain('Email')
    expect(html).not.toContain('Email *')
  })

  it('renders every authored block, and nothing it cannot render', () => {
    const html = render(form({ form: mockRichReportForm }))

    // The questions are the operator's, not this component's: a select with its own options, a
    // consent box, and authored prose above them.
    expect(html).toContain('How urgent is this?')
    expect(html).toContain('You may reply to me')
    // The select's OPTIONS are not asserted here: Radix keeps them in a closed portal, which
    // `renderToStaticMarkup` never renders, so either expectation would be about the portal
    // rather than the field (docs/testing.md).
    expect(html).toContain('We read every report.')
    // The authored submit label replaces ours.
    expect(html).toContain('Send it')
    expect(html).not.toContain('Send report')
    // The `payment` block is one this build has no control for. It is dropped rather than
    // thrown on — this form is what a viewer reaches after something else already broke.
    expect(html).not.toContain('fee')
  })

  it('shows the operator’s own confirmation copy once submitted, when they authored one', () => {
    const html = render(form({ form: mockRichReportForm, initialSubmitted: true }))

    expect(html).toContain('Thank you — a volunteer will look.')
  })

  it('falls back to our own copy only for a field the operator left unlabelled', () => {
    // The form-builder's `label` is optional, so without this a viewer sees the machine name.
    // The placeholder and the reply caveat travel with the label: under a question the operator
    // DID write, our hint would describe a different question.
    const unlabelled = render(
      form({
        form: {
          id: 7,
          fields: [
            { name: 'message', required: true, blockType: 'textarea' },
            { name: 'email', blockType: 'email' },
          ],
        },
      }),
    )

    expect(unlabelled).toContain('What went wrong? *')
    expect(unlabelled).toContain('Describe what you were doing and what looked wrong.')
    expect(unlabelled).toContain('you@example.com')
    // The caveat is addressable, not just visible — an SR user hears it on the field.
    expect(unlabelled).toContain('Optional — we can only reply if you leave one.')
    expect(unlabelled).toContain('id="report-field-1-help"')
    expect(unlabelled).toContain('aria-describedby="report-field-1-help"')

    // `mockReportForm` labels both fields, so none of our hints appear on it.
    const authored = render(form())

    expect(authored).not.toContain('Describe what you were doing')
    expect(authored).not.toContain('Optional — we can only reply')
  })

  it('caps an authored textarea at the schema ceiling', () => {
    const html = render(form())

    // This is a hard stop, so pasting a long stack trace cannot leave
    // submit silently disabled under a "write at least 10 characters"
    // message. This check is case-insensitive: react-dom/server emits the
    // prop name verbatim (`maxLength`), while the browser parses it as the
    // lowercase `maxlength` attribute.
    expect(html).toMatch(new RegExp(`maxlength="${REPORT_MESSAGE_MAX}"`, 'i'))
    expect(html).toContain('aria-required="true"')
  })

  it('starts with submit disabled — there is no message and no captcha token yet', () => {
    const html = render(form())

    expect(html).toContain('Send report')
    // The real attribute, not the `disabled:` Tailwind classes every Button carries.
    expect(html).toContain('disabled=""')
  })

  // The degradation this replaces put `contact@sydevelopers.com` on screen
  // as a `mailto:` link, on any host page whose CSP blocked the challenge.
  // That published the address to every scraper reading those pages
  // (issue #182). A blocked captcha now fails the whole widget at
  // `useTurnstileGuard`. So this state is only reachable for the two
  // failures the eager probe cannot see — a `frame-src` block, or an
  // unregistered domain. The form's job there is to explain the dead
  // button, not to offer another way to send the report.
  it('says why the submit is dead when the captcha is blocked, and names no inbox', () => {
    const html = render(form({ captchaUnavailable: true }))

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
    const html = render(form({ initialSubmitted: true }))

    expect(html).toContain('Thank you — your report is on its way to the team.')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Send report')
  })

  it('says a failed send failed, and keeps the form so it can be retried', () => {
    const html = render(form({ initialFailed: true }))

    // The whole point of issue #103: before this, submit alerted the payload and showed
    // the thank-you screen regardless, so a report that reached nobody read as delivered.
    expect(html).not.toContain('Thank you')
    expect(html).toContain('t sent. Wait for the security check to refresh')
    // No inbox appears on screen. The sentence used to carry
    // `contact@sydevelopers.com`, so a viewer whose POST failed had a route
    // that still worked. #182 removed it, because the same string rendered
    // on every host page whose CSP blocked the challenge.
    expect(html).not.toContain('sydevelopers.com')
    // The typed message survives the failure: the fields are still mounted.
    expect(html).toContain('<textarea')
    expect(html).toContain('Send report')
  })

  it('renders the failure as an assertive alert', () => {
    const html = render(form({ initialFailed: true }))

    // This ties the role to THIS sentence. A bare `role="alert"` is also
    // satisfied by the captcha-blocked banner and by FormField's own error
    // span. So the loose assertion would pass even with the failure alert
    // deleted.
    expect(html).toMatch(/role="alert"[^>]*>(?:(?!<\/div>).)*?wasn(?:&#x27;|')t sent/s)
  })
})
