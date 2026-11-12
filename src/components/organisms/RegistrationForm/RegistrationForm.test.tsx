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
    t: (key: string) => key,
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

  // The opt-in spawns a linked subscribe row server-side, and SahajCloud resolves whether any
  // list would receive it. Offering the box where none would is a promise nobody keeps.
  it('offers the mailing-list opt-in only when the event offers a list', () => {
    const offered = render(
      <RegistrationForm
        hasMailingList
        eventId={42}
        eventTitle="Evening meditation"
        isOnline={false}
        questions={[]}
        upcomingDates={[new Date('2026-10-01T18:00:00Z')]}
      />,
    )

    expect(offered).toContain('registration.form.subscribe')
    expect(offered).toContain('role="checkbox"')

    for (const ui of [
      form,
      <RegistrationForm
        key="false"
        eventId={42}
        eventTitle="Evening meditation"
        hasMailingList={false}
        isOnline={false}
        questions={[]}
        upcomingDates={[new Date('2026-10-01T18:00:00Z')]}
      />,
    ]) {
      const html = render(ui)

      expect(html).not.toContain('registration.form.subscribe')
      expect(html).not.toContain('role="checkbox"')
    }
  })

  // A list of dates pushed name, email and Register down the sheet; a dropdown takes one row.
  it('asks for the first class in a dropdown named by its label, not a radio list', () => {
    const html = render(form)

    expect(html).toMatch(/<label[^>]*for="startingAt"[^>]*>registration\.form\.first_class/)
    expect(html).toMatch(/<button[^>]*role="combobox"[^>]*id="startingAt"/)
    expect(html).not.toContain('role="radiogroup"')
  })

  // No browser bubble: the form checks the address itself and says so on the box.
  it('leaves validation to its own field errors, not the browser', () => {
    expect(render(form)).toMatch(/<form[^>]*noValidate/i)
  })

  it('offers the invite open on the confirmation, with Share and Copy link but no QR code', () => {
    const html = render(
      <RegistrationForm
        initialSubmitted
        eventId={42}
        eventTitle="Evening meditation"
        eventUrl="https://atlas.example/e/42"
        isOnline={false}
        questions={[]}
        upcomingDates={[new Date('2026-10-01T18:00:00Z')]}
      />,
    )

    expect(html).toMatch(/<h3[^>]*>registration\.form\.invite_friend<\/h3>/)
    expect(html).not.toContain('aria-expanded="false"><span')
    expect(html).toContain('share.native')
    expect(html).toContain('share.copy_link')
    expect(html).not.toContain('share.qr_title')
  })

  // A phone offers the visitor's own name and email only when the field says which it is.
  it('names the name and email fields for autofill', () => {
    const html = render(form)

    const input = (id: string) => new RegExp(`<input[^>]*id="${id}"[^>]*>`, 'i').exec(html)?.[0]

    expect(input('name')).toMatch(/autoComplete="name"/i)
    expect(input('email')).toMatch(/autoComplete="email"/i)
  })
})
