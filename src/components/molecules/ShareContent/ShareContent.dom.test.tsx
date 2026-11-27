// @vitest-environment jsdom
//
// A DOM, because what this covers is the screen after an async share or copy: whether the
// popover opened, and what Copy link says afterwards. SSR markup cannot reach either.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ShareContent } from './ShareContent'

const responsive = vi.hoisted(() => ({ coarse: false }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { platform?: string }) =>
      key === 'share.a11y.share_on' ? `Share on ${opts?.platform}` : key,
  }),
}))
vi.mock('@/config/responsive', () => ({ useCoarsePointer: () => responsive.coarse }))

const url = 'https://atlas.example/e/1'
const label = 'Saturday Morning Meditation'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

let container: HTMLDivElement
let unmount: () => void

afterEach(() => {
  act(() => unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  window.getSelection()?.removeAllRanges()
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'clipboard')
  responsive.coarse = false
})

// On the instance, so the rest of `navigator` stays real.
function stubNavigator(key: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true })
}

async function renderBlock() {
  container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  unmount = () => root.unmount()
  await act(async () => root.render(<ShareContent country="RU" label={label} url={url} />))
}

const buttonNamed = (text: string) =>
  [...document.querySelectorAll('button')].find((button) => button.textContent === text)

const press = (text: string) => act(async () => buttonNamed(text)?.click())

const popover = () => document.querySelector('[role="dialog"]')

describe('ShareContent — Share', () => {
  it('opens the device sheet, with the class title and link, and no popover', async () => {
    const share = vi.fn(() => Promise.resolve())

    stubNavigator('share', share)
    await renderBlock()
    await press('share.native')

    expect(share).toHaveBeenCalledWith({ title: label, url })
    expect(popover()).toBeNull()
  })

  it('keeps the button when the visitor backs out of the sheet', async () => {
    stubNavigator('share', () => Promise.reject(new DOMException('', 'AbortError')))
    await renderBlock()
    await press('share.native')

    expect(popover()).toBeNull()
    expect(buttonNamed('share.native')).toBeDefined()
  })

  it.each([
    [
      'a host page refuses the sheet',
      () => Promise.reject(new DOMException('', 'NotAllowedError')),
    ],
    ['there is no sheet', undefined],
  ])('opens the region’s networks when %s, and closes after a pick', async (_, share) => {
    const open = vi.fn(() => null)

    vi.stubGlobal('open', open)
    if (share) stubNavigator('share', share)
    await renderBlock()
    await press('share.native')

    // VK is in Russia's list alone, so finding it proves the popover holds the region's. The
    // targets are their own chunk, so they arrive a moment after the popover does.
    const vk = await vi.waitFor(() => {
      const button = popover()?.querySelector<HTMLButtonElement>('[aria-label="Share on VK"]')

      if (!button) throw new Error('the targets have not arrived')

      return button
    })

    await act(async () => vk.click())

    expect(open).toHaveBeenCalledOnce()
    expect(popover()).toBeNull()
  })

  // Copy link answers in place, so the popover stays for the visitor to read that it worked.
  it('keeps the popover open after its Copy link, which says it copied', async () => {
    const writeText = vi.fn(() => Promise.resolve())

    stubNavigator('clipboard', { writeText })
    await renderBlock()
    await press('share.native')

    const copy = await vi.waitFor(() => {
      const button = [...(popover()?.querySelectorAll('button') ?? [])].find(
        (candidate) => candidate.textContent === 'share.copy_link',
      )

      if (!button) throw new Error('the targets have not arrived')

      return button
    })

    await act(async () => copy.click())

    expect(writeText).toHaveBeenCalledWith(url)
    expect(popover()).not.toBeNull()
    expect(copy.textContent).toBe('share.link_copied')
  })

  // Once a refusal has opened the popover, the button closes it rather than asking again.
  it('closes the open popover from the Share button', async () => {
    const share = vi.fn(() => Promise.reject(new DOMException('', 'NotAllowedError')))

    stubNavigator('share', share)
    await renderBlock()
    await press('share.native')
    expect(popover()).not.toBeNull()

    await press('share.native')
    expect(popover()).toBeNull()
    expect(share).toHaveBeenCalledOnce()
  })
})

describe('ShareContent — Copy link', () => {
  it('copies the link and says "Link copied" for 2.5 seconds, out loud too', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const writeText = vi.fn(() => Promise.resolve())
    const live = () => container.querySelector('[aria-live]')?.textContent

    stubNavigator('clipboard', { writeText })
    await renderBlock()
    await press('share.copy_link')

    expect(writeText).toHaveBeenCalledWith(url)
    expect(buttonNamed('share.link_copied')).toBeDefined()
    expect(live()).toBe('share.link_copied')

    await act(async () => vi.advanceTimersByTime(2499))
    expect(buttonNamed('share.link_copied')).toBeDefined()

    await act(async () => vi.advanceTimersByTime(1))
    expect(buttonNamed('share.copy_link')).toBeDefined()
    expect(live()).toBe('')
  })

  it.each([
    [false, 'share.copy_failed_pointer'],
    [true, 'share.copy_failed_touch'],
  ])('selects the link, and says how to copy it by hand (touch: %s)', async (coarse, hint) => {
    responsive.coarse = coarse
    stubNavigator('clipboard', {
      writeText: () => Promise.reject(new DOMException('', 'NotAllowedError')),
    })
    await renderBlock()
    await press('share.copy_link')

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(hint)
    expect(window.getSelection()?.toString()).toBe(url)
    expect(buttonNamed('share.copy_link')).toBeDefined()
  })
})
