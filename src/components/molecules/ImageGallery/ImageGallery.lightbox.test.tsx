// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ImageGallery, type Slide } from './ImageGallery'

import { setThemeRoot } from '@/hooks/use-theme'

/**
 * The lightbox is a portal, so only a DOM can say what it shows: which photo opens, how the
 * controls move between them, and that it closes.
 */
const direction = vi.hoisted(() => ({ value: 'ltr' }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${values.current}/${values.total}` : key,
    i18n: { dir: () => direction.value },
  }),
}))

const slides: Slide[] = [
  { src: 'https://example.test/a.jpg', alt: 'A', caption: 'Caption A' },
  { src: 'https://example.test/b.jpg', alt: 'B', caption: 'Caption B' },
  { src: 'https://example.test/c.jpg', alt: 'C' },
]

let cleanup: (() => void) | null = null

afterEach(async () => {
  await act(async () => {
    cleanup?.()
  })
  cleanup = null
  setThemeRoot(null)
  document.body.innerHTML = ''
  direction.value = 'ltr'
})

async function mount(items: Slide[] = slides) {
  const host = document.createElement('div')

  document.body.append(host)
  setThemeRoot(host)
  const root = createRoot(host)

  await act(async () => {
    root.render(<ImageGallery slides={items} />)
  })
  cleanup = () => root.unmount()

  return host
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const shown = () => dialog()?.querySelector('img')?.getAttribute('src')
const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)

async function click(element: HTMLElement | null) {
  await act(async () => {
    element?.click()
  })
}

async function press(key: string) {
  await act(async () => {
    dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('ImageGallery lightbox', () => {
  it('opens on the photo that was clicked, titled with its position and showing its caption', async () => {
    await mount()
    await click(byLabel('B'))

    expect(shown()).toBe('https://example.test/b.jpg')
    expect(dialog()?.textContent).toContain('event.a11y.photo_position:2/3')
    expect(dialog()?.querySelector('figcaption')?.textContent).toBe('Caption B')
  })

  it('steps forward and back with the buttons, wrapping at either end', async () => {
    await mount()
    await click(byLabel('C'))

    await click(byLabel('event.a11y.next_photo'))
    expect(shown()).toBe('https://example.test/a.jpg')

    await click(byLabel('event.a11y.previous_photo'))
    expect(shown()).toBe('https://example.test/c.jpg')
  })

  it('steps with the arrow keys', async () => {
    await mount()
    await click(byLabel('A'))

    await press('ArrowRight')
    expect(shown()).toBe('https://example.test/b.jpg')

    await press('ArrowLeft')
    await press('ArrowLeft')
    expect(shown()).toBe('https://example.test/c.jpg')
  })

  it('swaps the arrow keys right to left', async () => {
    direction.value = 'rtl'
    await mount()
    await click(byLabel('A'))

    await press('ArrowLeft')
    expect(shown()).toBe('https://example.test/b.jpg')
  })

  it('closes from its close button', async () => {
    await mount()
    await click(byLabel('A'))
    expect(dialog()).not.toBeNull()

    await click(byLabel('event.a11y.close_photo'))
    expect(dialog()).toBeNull()
  })

  it('closes on a click around the photo, but not on the photo itself', async () => {
    await mount()
    await click(byLabel('A'))

    await click(dialog()?.querySelector('img') ?? null)
    expect(dialog()).not.toBeNull()

    await click(dialog()?.querySelector('figure') ?? null)
    expect(dialog()).toBeNull()
  })

  it('closes on Escape', async () => {
    await mount()
    await click(byLabel('A'))

    await press('Escape')
    expect(dialog()).toBeNull()
  })

  it('offers no stepping for a single photo', async () => {
    await mount([slides[0]])
    await click(byLabel('A'))

    expect(dialog()?.textContent).toContain('event.a11y.photo')
    expect(byLabel('event.a11y.next_photo')).toBeNull()
    expect(byLabel('event.a11y.previous_photo')).toBeNull()
  })
})
