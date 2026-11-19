// @vitest-environment jsdom
//
// react-share composes a target's URL inside its click handler and hands it to `window.open`, or
// to `location.href` for email, so no markup carries it and only a click reads it back. A library
// change that moves one of these literals changes what a visitor's share carries.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PlatformButton } from './platform-buttons'

import { type PlatformKey } from '@/lib/share/platforms'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

// Non-ASCII and reserved characters in both fields, so an encoding change shows in the URL.
const event = {
  title: 'Café Meditation: Body & Mind #1 — 100% free?',
  url: 'https://atlas.example/e/café',
}

// Recorded from react-share 5.3.0. Literals, not `encodeURIComponent` calls: encoding them the
// library's way would agree with the library by construction.
const ENC_URL = 'https%3A%2F%2Fatlas.example%2Fe%2Fcaf%C3%A9'
const ENC_TITLE =
  'Caf%C3%A9%20Meditation%3A%20Body%20%26%20Mind%20%231%20%E2%80%94%20100%25%20free%3F'

const RECORDED = {
  whatsapp: ['popup', `https://api.whatsapp.com/send?text=${ENC_TITLE}%20${ENC_URL}`],
  telegram: ['popup', `https://telegram.me/share/url?url=${ENC_URL}&text=${ENC_TITLE}`],
  facebook: ['popup', `https://www.facebook.com/sharer/sharer.php?u=${ENC_URL}`],
  x: ['popup', `https://twitter.com/intent/tweet?url=${ENC_URL}&text=${ENC_TITLE}`],
  linkedin: [
    'popup',
    `https://linkedin.com/shareArticle?url=${ENC_URL}&mini=true&title=${ENC_TITLE}`,
  ],
  reddit: ['popup', `https://www.reddit.com/submit?url=${ENC_URL}&title=${ENC_TITLE}`],
  email: ['location', `mailto:?subject=${ENC_TITLE}&body=${ENC_URL}`],
  vk: [
    'popup',
    `https://vk.com/share.php?url=${ENC_URL}&title=${ENC_TITLE}&noparse=0&no_vk_links=0`,
  ],
  ok: ['popup', `https://connect.ok.ru/offer?url=${ENC_URL}&title=${ENC_TITLE}`],
  line: ['popup', `https://social-plugins.line.me/lineit/share?url=${ENC_URL}&text=${ENC_TITLE}`],
  viber: ['popup', `viber://forward?text=${ENC_TITLE}%20${ENC_URL}`],
  weibo: ['popup', `http://service.weibo.com/share/share.php?url=${ENC_URL}&title=${ENC_TITLE}`],
} satisfies Record<PlatformKey, [via: 'popup' | 'location', href: string]>

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
  vi.unstubAllGlobals()
})

async function share(platform: PlatformKey) {
  const root = createRoot(container)

  await act(async () => {
    root.render(<PlatformButton platform={platform} title={event.title} url={event.url} />)
  })

  const open = vi.fn<(url: string) => null>(() => null)
  const location = { href: 'about:blank' }

  vi.stubGlobal('open', open)
  vi.stubGlobal('location', location)
  await act(async () => container.querySelector('button')!.click())
  vi.unstubAllGlobals()
  act(() => root.unmount())

  const popups = open.mock.calls.map(([url]) => ['popup', url])
  const navigations = location.href === 'about:blank' ? [] : [['location', location.href]]

  return [...popups, ...navigations]
}

describe('PlatformButton share URLs', () => {
  it.each(Object.entries(RECORDED))('%s opens the recorded URL', async (platform, recorded) => {
    expect(await share(platform as PlatformKey)).toEqual([recorded])
  })
})
