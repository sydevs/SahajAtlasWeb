import type { ReactElement } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { RegistrationForm } from './RegistrationForm'

import { USER_SUBMISSION_VALUE_MAX } from '@/config/api/mutate'

// The SDK is stubbed at the boundary, so importing the form's `api` module cannot
// reach a network client. `@/config/i18n` is stubbed for the same reason — the real
// module boots an HTTP backend. The submit path itself is covered in
// `config/api/mutate.test.ts`.
vi.mock('@payloadcms/sdk', () => ({
  PayloadSDK: class {
    request = vi.fn()
  },
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // The consent line carries the link markup a translation would, so its rendering is visible.
    t: (key: string) =>
      key === 'registration.form.privacy_policy'
        ? 'In accordance with our <link>privacy policy</link>.'
        : key,
    i18n: { on: () => {}, off: () => {}, resolvedLanguage: 'en' },
  }),
}))

const render = (ui: ReactElement) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

const form = (
  <RegistrationForm
    eventId={42}
    eventTitle="Evening meditation"
    isOnline={false}
    questions={['experience', 'questions']}
    upcomingDates={[new Date('2026-10-01T18:00:00Z')]}
  />
)

describe('RegistrationForm', () => {
  // Every free-form answer rides in `submissionData`, where SahajCloud bounds one value
  // at `USER_SUBMISSION_VALUE_MAX`. An over-long one refuses the WHOLE registration as a
  // `ValidationError` — no `errors[].data.code`, so the registrant gets the generic
  // panel and loses everything they typed. The hard stop is what keeps that unreachable.
  // These checks are case-insensitive: react-dom/server emits the prop name verbatim
  // (`maxLength`), while the browser parses it as the lowercase `maxlength` attribute.
  it('caps every free-form answer at the collection bound', () => {
    const html = render(form)

    const capped = html.match(new RegExp(`maxlength="${USER_SUBMISSION_VALUE_MAX}"`, 'gi')) ?? []

    // The name plus both enabled questions — the three values this form puts in the blob.
    expect(capped).toHaveLength(3)
  })

  it('caps the name, which rides in the blob beside the answers', () => {
    const html = render(form)

    expect(html).toMatch(new RegExp(`id="name"[^>]*maxlength="${USER_SUBMISSION_VALUE_MAX}"`, 'i'))
  })

  // A phone offers the visitor's own name and email only when the field says which it is.
  it('names the name and email fields for autofill', () => {
    const html = render(form)

    expect(html).toMatch(/autoComplete="name"[^>]*id="name"/i)
    expect(html).toMatch(/autoComplete="email"[^>]*id="email"/i)
  })

  it('links the words a translation marks in the consent line to the privacy policy', () => {
    const html = render(form)

    expect(html).toMatch(
      /In accordance with our <a [^>]*href="https:\/\/wemeditate\.com\/privacy"[^>]*>privacy policy<\/a>\./,
    )
    expect(html).not.toContain('&lt;link&gt;')
  })
})
