// @vitest-environment jsdom
import type { EventImage } from '@/types'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ImageGallery } from './ImageGallery'

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

const images: EventImage[] = [
  { url: 'https://example.test/a.jpg', alt: 'A' },
  { url: 'https://example.test/b.jpg', alt: 'B' },
  { url: 'https://example.test/c.jpg', alt: 'C' },
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

async function mount(items: EventImage[] = images) {
  const host = document.createElement('div')

  document.body.append(host)
  setThemeRoot(host)
  const root = createRoot(host)

  await act(async () => {
    root.render(<ImageGallery images={items} />)
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

async function swipe(dx: number) {
  const target = dialog()?.querySelector('figure')

  await act(async () => {
    for (const [type, clientX] of [
      ['pointerdown', 200],
      ['pointerup', 200 + dx],
    ] as const) {
      target?.dispatchEvent(
        new PointerEvent(type, { bubbles: true, clientX, pointerType: 'touch' }),
      )
    }
  })
}

describe('ImageGallery lightbox', () => {
  // The alt text is the visible caption, so the image is silent rather than read twice.
  it('opens on the photo that was clicked, titled with its position and captioned by its alt', async () => {
    await mount()
    await click(byLabel('B'))

    expect(shown()).toBe('https://example.test/b.jpg')
    expect(dialog()?.textContent).toContain('event.a11y.photo_position:2/3')
    expect(dialog()?.querySelector('figcaption')?.textContent).toBe('B')
    expect(dialog()?.querySelector('img')?.getAttribute('alt')).toBe('')
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

  it('steps with a sideways swipe, ignoring a short one', async () => {
    await mount()
    await click(byLabel('A'))

    await swipe(-80)
    expect(shown()).toBe('https://example.test/b.jpg')

    await swipe(20)
    expect(shown()).toBe('https://example.test/b.jpg')
  })

  it('mirrors the swipe right to left', async () => {
    direction.value = 'rtl'
    await mount()
    await click(byLabel('A'))

    await swipe(80)
    expect(shown()).toBe('https://example.test/b.jpg')
  })

  it('closes from its close button', async () => {
    await mount()
    await click(byLabel('A'))
    expect(dialog()).not.toBeNull()

    await click(byLabel('event.a11y.close_photo'))
    expect(dialog()).toBeNull()
  })

  it('closes on Escape', async () => {
    await mount()
    await click(byLabel('A'))

    await press('Escape')
    expect(dialog()).toBeNull()
  })

  it('offers no stepping for a single photo', async () => {
    await mount([images[0]])
    await click(byLabel('A'))

    expect(dialog()?.textContent).toContain('event.a11y.photo_position:1/1')
    expect(byLabel('event.a11y.next_photo')).toBeNull()
    expect(byLabel('event.a11y.previous_photo')).toBeNull()
  })
})
