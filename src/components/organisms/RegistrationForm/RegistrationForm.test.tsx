import type { ReactElement } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

// The consent line carries the link markup a translation would, so its rendering is visible. A
// test that needs other copy sets `text`, and every test starts from the marked sentence again.
const consent = vi.hoisted(() => {
  const marked = 'By registering you agree, in accordance with our <link>privacy policy</link>.'

  return { marked, text: marked }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'registration.form.privacy_policy' ? consent.text : key),
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
  beforeEach(() => {
    consent.text = consent.marked
  })

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

    const input = (id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0]

    expect(input('name')).toMatch(/autoComplete="name"/i)
    expect(input('email')).toMatch(/autoComplete="email"/i)
  })

  // A list of dates pushed name, email and Register down the sheet; a dropdown takes one row.
  it('asks for the first class in a dropdown named by its label', () => {
    const html = render(form)

    expect(html).toMatch(/<label[^>]*for="startingAt"[^>]*>registration\.form\.first_class/)
    expect(html).toMatch(/<button[^>]*role="combobox"[^>]*id="startingAt"/)
    expect(html).not.toContain('role="radiogroup"')
  })

  // No browser bubble: the form checks the address itself and says so on the box.
  it('leaves validation to its own field errors, not the browser', () => {
    expect(render(form)).toMatch(/<form[^>]*noValidate/i)
  })

  it('marks only the questions optional, and name and email required', () => {
    const html = render(form)
    const label = (id: string) =>
      new RegExp(`<label[^>]*for="${id}"[^>]*>(.*?)</label>`).exec(html)?.[1]

    expect(label('name')).toBe('registration.form.name *')
    expect(label('email')).toBe('registration.form.email *')
    expect(label('questions.experience')).toContain('(common.chrome.optional)')
    expect(html.match(/\(common\.chrome\.optional\)/g)).toHaveLength(2)
  })

  it('ends with one full-width Register, and no Cancel', () => {
    const html = render(form)

    expect(html.match(/type="submit"/g)).toHaveLength(1)
    const register = /<button[^>]*type="submit"[^>]*>/.exec(html)?.[0] ?? ''

    expect(register).toMatch(/class="[^"]*\bw-full\b/)
    expect(register).toMatch(/disabled=""/)
    expect(register).toMatch(/form="[^"]+"/)
    expect(html).not.toContain('common.chrome.cancel')
    expect(html).toContain('registration.form.checking')
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
    // Open as a section, not a disclosure the visitor has to expand first.
    expect(html).not.toContain('<details')
    expect(html).not.toMatch(/<button[^>]*>[^<]*registration\.form\.invite_friend/)
    expect(html).toContain('share.native')
    expect(html).toContain('share.copy_link')
    expect(html).not.toMatch(/share\.qr|<canvas/)
    expect(html).not.toContain('registration.form.okay')
    expect(html).not.toContain('type="submit"')
  })

  describe('consent line', () => {
    const consentLine = (html: string) =>
      /<p class="([^"]*)">By registering[\s\S]*?<\/p>/.exec(html)

    it('links the words a translation marks to the privacy policy, in a new tab', () => {
      const html = render(form)

      expect(html).toMatch(
        /By registering you agree, in accordance with our <a [^>]*href="https:\/\/wemeditate\.com\/privacy"[^>]*>privacy policy<\/a>\./,
      )
      expect(html).not.toContain('&lt;link&gt;')

      const anchor = /<a [^>]*href="https:\/\/wemeditate\.com\/privacy"[^>]*>/.exec(html)?.[0] ?? ''

      expect(anchor).toContain('target="_blank"')
      expect(anchor).toMatch(/rel="[^"]*\bnoopener\b/)
    })

    it('sets the line left-aligned, at the card size, in the quiet grey', () => {
      const classes = consentLine(render(form))?.[1].split(' ') ?? []

      expect(classes).toEqual(expect.arrayContaining(['text-sm', 'text-gray-11']))
      expect(classes).not.toContain('text-center')
      expect(classes).not.toContain('text-xs')
    })

    it('reads a translation without the mark whole, as plain text', () => {
      consent.text = 'By registering you agree, in accordance with our privacy policy.'

      const line = consentLine(render(form))?.[0] ?? ''

      expect(line).toContain('By registering you agree, in accordance with our privacy policy.')
      expect(line).not.toContain('<a ')
    })
  })
})
