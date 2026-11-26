import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { EventDetails } from './EventDetails'

import { mockEvent } from '@/mocks/events'
import { countResolves } from '@/test-support/count-resolves'

// The chips and the facts render for real. The register bar and the actions resolve for
// themselves and are stubbed, so the count is the pair's alone.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageCode: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('./EventRegister', () => ({ EventRegisterBar: () => null }))
vi.mock('@/components/molecules/EventActions', () => ({ EventActions: () => null }))
// DOMPurify binds a real `window` at module scope; `sanitize.test.ts` owns that allowlist.
vi.mock('./sanitize', () => ({ sanitizeDescription: (html: string) => html }))

let resolves: ReturnType<typeof countResolves>

beforeEach(() => {
  resolves = countResolves()
})
afterEach(() => resolves.restore())

it("shares one resolve between the class page's chips and facts", () => {
  renderToStaticMarkup(<EventDetails basePath="/gb/cambridge/1" event={mockEvent} />)

  expect(resolves.count).toBe(1)
})
