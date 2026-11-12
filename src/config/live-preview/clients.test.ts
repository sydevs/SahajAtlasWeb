// @vitest-environment jsdom
import type { PaletteRoles } from '@/config/theme/palette'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startClientsPreview } from './clients'
import livePreview, { LIVE_PREVIEW_INACTIVE } from './protocol'

import { SERVER_ORIGIN } from '@/components/live-preview/populate'

/**
 * The session is a `window` message listener, so what is worth asserting is which
 * messages reach the paint — the filter, not the paint. A host page that frames
 * the atlas can post whatever shape it likes; only the admin's own origin repaints.
 */
const post = (origin: string, data: unknown) =>
  window.dispatchEvent(new MessageEvent('message', { data, origin }))

const colours = (data: Record<string, string>) => ({
  collectionSlug: 'clients',
  data,
  type: 'payload-live-preview',
})

describe('the clients preview session', () => {
  let painted: PaletteRoles[]
  let sent: { message: unknown; origin: string }[]
  let stop: () => void

  beforeEach(() => {
    painted = []
    sent = []
    vi.spyOn(window.parent, 'postMessage').mockImplementation((message, origin) => {
      sent.push({ message, origin: origin as string })
    })
    Object.assign(livePreview, { active: true, scope: 'clients', token: 'tok' })
    stop = startClientsPreview((brand) => painted.push(brand))
  })

  afterEach(() => {
    stop()
    document.documentElement.classList.remove('dark', 'light')
    vi.restoreAllMocks()
    Object.assign(livePreview, LIVE_PREVIEW_INACTIVE)
  })

  it('repaints from the admin origin and from nowhere else', () => {
    post('https://evil.example', colours({ color1: '#ffff00' }))

    expect(painted).toEqual([])

    post(SERVER_ORIGIN, colours({ color1: '#ffff00', color2: '#000080', color3: '#d8735a' }))

    expect(painted).toEqual([{ contrast: '#d8735a', primary: '#ffff00', secondary: '#000080' }])
  })

  it('reads the colours and ignores every other field Payload posts', () => {
    // Payload posts the whole `clients` form, admin-only fields included.
    post(SERVER_ORIGIN, colours({ color1: '#1E6C71', notes: 'internal', region: '4' }))

    expect(painted[0]).toEqual({ contrast: null, primary: '#1E6C71', secondary: null })
  })

  it('opens with Payload’s ready handshake, so the admin posts the current form', () => {
    expect(sent).toEqual([
      { message: { ready: true, type: 'payload-live-preview' }, origin: SERVER_ORIGIN },
    ])
  })

  it('answers every repaint with what it rendered', () => {
    post(SERVER_ORIGIN, colours({ color1: '#ffff00' }))

    const { message, origin } = sent[1]

    expect(origin).toBe(SERVER_ORIGIN)
    expect(message).toMatchObject({
      roles: { primary: { entered: '#ffff00' } },
      type: 'sahaj-atlas:palette-report',
    })
    expect(
      (message as { roles: { primary: { adjustedBy: string[] } } }).roles.primary.adjustedBy,
    ).toContain('surface')
  })

  it('switches mode, and reports again', () => {
    post(SERVER_ORIGIN, colours({ color1: '#1E6C71' }))
    post(SERVER_ORIGIN, { mode: 'dark', type: 'sahaj-atlas:preview-mode' })

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    // The handshake, then one report per repaint.
    expect(sent).toHaveLength(3)
  })
})
