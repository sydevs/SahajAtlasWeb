// @vitest-environment jsdom
//
// A DOM, because what this covers is the screen after an async copy is refused, which SSR markup
// cannot reach.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EventFacts } from './EventFacts'

import { mockEvent } from '@/mocks/events'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en' }),
}))

afterEach(() => {
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
  Reflect.deleteProperty(navigator, 'clipboard')
})

async function tapAddress(clipboard: { writeText: () => Promise<void> } | undefined) {
  // On the instance, so the rest of `navigator` (its languages, for the dates) stays real.
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
  const container = document.createElement('div')

  document.body.append(container)
  const root = createRoot(container)

  await act(async () => root.render(<EventFacts event={mockEvent} />))
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label^="event.actions.copy_address"]')
      ?.click(),
  )

  return { container, root }
}

describe('EventFacts — the address copy', () => {
  const street = mockEvent.address?.street ?? ''

  it('says the address was copied', async () => {
    const { container, root } = await tapAddress({ writeText: () => Promise.resolve() })

    expect(container.textContent).toContain('event.actions.address_copied')
    await act(async () => root.unmount())
  })

  it.each([
    ['refused', { writeText: () => Promise.reject(new DOMException('', 'NotAllowedError')) }],
    ['missing', undefined],
  ])('selects the address to copy by hand when the clipboard is %s', async (_, clipboard) => {
    const { container, root } = await tapAddress(clipboard)

    expect(street).not.toBe('')
    expect(container.textContent).not.toContain('event.actions.address_copied')
    expect(window.getSelection()?.toString()).toContain(street)
    await act(async () => root.unmount())
  })
})
