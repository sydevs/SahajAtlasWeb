// @vitest-environment jsdom
//
// A DOM, because what this covers is the screen after an async copy is refused: the popover the
// refusal opens, which SSR markup cannot reach.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ShareDates } from './ShareDates'

import { type HrefFor, RoutingContext } from '@/config/routing'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const resolver: HrefFor = (route) => `https://host.example/classes?atlas=${route}`

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function pressShare(writeText: () => Promise<void>) {
  // No share sheet, as on most computers, so the button copies.
  vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })

  const root = createRoot(container)

  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/calendar?region=gb&view=list']}>
        <RoutingContext.Provider value={resolver}>
          <ShareDates end="2026-11-19" label="13–19 Nov" start="2026-11-13" />
        </RoutingContext.Provider>
      </MemoryRouter>,
    ),
  )
  await act(async () => container.querySelector('button')?.click())

  return root
}

describe('ShareDates', () => {
  it('copies the link for the dates on screen, and says so on the button', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    const root = await pressShare(writeText)

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('dates=2026-11-13'))
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(
      'calendar.link_copied',
    )
    expect(document.body.textContent).not.toContain('share.copy_failed_pointer')

    await act(async () => root.unmount())
  })

  it('shows the link to copy by hand when the clipboard is refused', async () => {
    const root = await pressShare(() => Promise.reject(new DOMException('', 'NotAllowedError')))
    const alert = document.body.querySelector('[role="alert"]')

    expect(alert?.textContent).toBe('share.copy_failed_pointer')
    expect(document.body.textContent).toContain('https://host.example/classes?atlas=/calendar')
    expect(window.getSelection()?.toString()).toContain('dates=2026-11-13')

    await act(async () => root.unmount())
  })
})
