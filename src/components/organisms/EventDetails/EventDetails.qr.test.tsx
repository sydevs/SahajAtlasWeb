import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { EventDetails } from './EventDetails'

import { mockEvent, mockEventImages } from '@/mocks/events'

// Node-only SSR (see `docs/testing.md`). Each stub renders a MARKER, so an absence assertion
// cannot pass merely because a stub rendered nothing.
const share = vi.hoisted(() => ({ url: 'https://atlas.example/e/1' as string | undefined }))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-share-url', () => ({ useShareUrl: () => share.url }))
vi.mock('@/components/molecules/QrPoster', () => ({
  QrPoster: ({ url }: { url: string }) => <i>qr-slot:{url}</i>,
}))
vi.mock('@/components/molecules/ImageCarousel', () => ({ ImageCarousel: () => <i>images-slot</i> }))
vi.mock('./EventRegister', () => ({ EventRegisterBar: () => <i>register-slot</i> }))
vi.mock('@/components/molecules/EventActions', () => ({ EventActions: () => <i>actions-slot</i> }))
vi.mock('@/components/molecules/EventChips', () => ({ EventChips: () => <i>chips-slot</i> }))
vi.mock('@/components/molecules/EventFacts', () => ({ EventFacts: () => <i>facts-slot</i> }))
// DOMPurify binds a real `window` at module scope. `sanitize.test.ts` owns that allowlist.
vi.mock('./sanitize', () => ({ sanitizeDescription: (html: string) => html }))

const panel = (event = { ...mockEvent, images: mockEventImages }) =>
  renderToStaticMarkup(<EventDetails basePath="/gb/london/1" event={event} />)

describe('EventDetails — the poster QR code', () => {
  it('ends the class page, after the images, with the class link', () => {
    share.url = 'https://atlas.example/e/1'
    const markup = panel()

    expect(markup).toContain('qr-slot:https://atlas.example/e/1')
    expect(markup.indexOf('images-slot')).toBeLessThan(markup.indexOf('qr-slot'))
    expect(markup.trimEnd().endsWith('</i></div>')).toBe(true)
    // The row under the images keeps the page's bottom padding.
    expect(markup).toMatch(/^<div class="[^"]*\bpb-10\b/)
  })

  // Nothing identifies the class on a host page that routes the widget off its URL (#115).
  it('is left out when the class has no link to share, and the images end the page flush', () => {
    share.url = undefined
    const markup = panel()

    expect(markup).toContain('images-slot')
    expect(markup).not.toContain('qr-slot')
    expect(markup).not.toMatch(/^<div class="[^"]*\bpb-10\b/)
  })
})
