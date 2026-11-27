import type { ReactElement } from 'react'
import type { ReportContext } from '@/lib/report'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ReportIssueForm } from './ReportIssueForm'

import { mockReportForm, mockRichReportForm } from '@/mocks/report-form'
import { USER_SUBMISSION_VALUE_MAX, userSubmissionValueMax } from '@/config/api/mutate'

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
        'common.report_errors.message': `Please write at least ${opts?.min} characters.`,
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
    expect(html).toMatch(new RegExp(`maxlength="${userSubmissionValueMax('message')}"`, 'i'))
    expect(html).toContain('aria-required="true"')
  })

  it('caps a renamed textarea at the bound its own NAME carries', () => {
    // Every fixture here names its textarea `message`, which is the one name the collection
    // raises. An operator names their own fields, so the control must read the bound off the
    // name rather than off the block type — otherwise it invites 5000 characters into a key
    // that takes 2000 and loses the whole submission at submit.
    const renamed = {
      ...mockReportForm,
      fields: [{ name: 'what-went-wrong', label: 'What went wrong?', blockType: 'textarea' }],
    }

    expect(render(form({ form: renamed }))).toMatch(
      new RegExp(`maxlength="${USER_SUBMISSION_VALUE_MAX}"`, 'i'),
    )
  })

  it('starts with submit disabled — there is no message and no captcha token yet', () => {
    const html = render(form())

    expect(html).toContain('Send report')
    // The real attribute, not the `disabled:` Tailwind classes every Button carries.
    expect(html).toContain('disabled=""')
  })

  it('replaces the form with the thank-you state once submitted', () => {
    const html = render(form({ initialSubmitted: true }))

    expect(html).toContain('Thank you — your report is on its way to the team.')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Send report')
  })
})
