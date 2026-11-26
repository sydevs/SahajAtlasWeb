import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { EventDetails } from './EventDetails'

import { useEventDisplay } from '@/hooks/use-event-display'
import { mockEvent } from '@/mocks/events'
import { countResolves } from '@/test-support/count-resolves'

// Every surface on the class page renders for real — chips, facts, Register and the action
// row — so a surface that resolves for itself again shows in the count.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageCode: 'en', languageLabel: (code: string) => code }),
}))
// DOMPurify binds a real `window` at module scope; `sanitize.test.ts` owns that allowlist.
vi.mock('./sanitize', () => ({ sanitizeDescription: (html: string) => html }))

let resolves: ReturnType<typeof countResolves>

beforeEach(() => {
  resolves = countResolves()
})
afterEach(() => resolves.restore())

// EventView's half: one resolve, handed to the panel.
const Page = () => (
  <EventDetails basePath="/gb/cambridge/1" event={mockEvent} strings={useEventDisplay(mockEvent)} />
)

it('resolves the class page once, for every surface on it', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  )

  // Both CTAs rendered, so the count covers them.
  expect(html).toContain('event.actions.directions')
  expect(resolves.count).toBe(1)
})
