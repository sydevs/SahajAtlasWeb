// @vitest-environment jsdom
//
// A DOM, because what this covers is the screen after an async copy, which SSR markup cannot reach.
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

const FULL = '5 Market St, Cambridge CB2 3QJ'

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
  window.getSelection()?.removeAllRanges()
  Reflect.deleteProperty(navigator, 'clipboard')
})

async function tapAddress(clipboard: { writeText: (text: string) => Promise<void> } | undefined) {
  // On the instance, so the rest of `navigator` (its languages, for the dates) stays real.
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
  const container = document.createElement('div')

  document.body.append(container)
  const root = createRoot(container)

  await act(async () => root.render(<EventFacts event={mockEvent} />))
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label^="event.a11y.copy_address"]')?.click(),
  )

  return { container, root }
}

describe('EventFacts — the address copy', () => {
  it('copies street, town and postcode, and says so for two seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const writeText = vi.fn(() => Promise.resolve())
    const { container, root } = await tapAddress({ writeText })
    const live = () => container.querySelector('[aria-live]')?.textContent

    expect(writeText).toHaveBeenCalledWith(FULL)
    expect(live()).toBe('common.chrome.copied')
    expect(container.textContent).not.toContain(FULL)

    await act(async () => vi.advanceTimersByTime(2000))
    expect(live()).toBe('')
    expect(container.textContent).toContain(FULL)
    await act(async () => root.unmount())
  })

  it.each([
    ['refused', { writeText: () => Promise.reject(new DOMException('', 'NotAllowedError')) }],
    ['missing', undefined],
  ])('selects the address to copy by hand when the clipboard is %s', async (_, clipboard) => {
    const { container, root } = await tapAddress(clipboard)

    expect(container.textContent).not.toContain('common.chrome.copied')
    expect(window.getSelection()?.toString()).toBe(FULL)
    await act(async () => root.unmount())
  })
})
