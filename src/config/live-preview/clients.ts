import { ready } from '@payloadcms/live-preview'

import livePreview from './protocol'

import { SERVER_ORIGIN } from '@/components/live-preview/populate'
import { paletteReport, type PaletteRoles, type ThemeMode } from '@/config/theme/palette'
import { applyTheme } from '@/hooks/use-theme'

/** What the CMS sends the atlas, and what the atlas sends back. */
export const PREVIEW_MODE_MESSAGE = 'sahaj-atlas:preview-mode'
export const PALETTE_REPORT_MESSAGE = 'sahaj-atlas:palette-report'

type Incoming = {
  collectionSlug?: string
  data?: Record<string, unknown>
  mode?: string
  type?: string
}

const hex = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** The three stored colours, under the names the ladder knows them by. */
const brandFrom = (data: Record<string, unknown> | undefined): PaletteRoles => ({
  contrast: hex(data?.color3),
  primary: hex(data?.color1),
  secondary: hex(data?.color2),
})

/**
 * The SahajCloud `clients` preview session, on the standalone page only.
 *
 * A service manager edits their three atlas colours on the Atlas tab and the map
 * repaints as the picker moves, with no save. The atlas answers with what it
 * actually rendered, which is what lets the CMS show the colour visitors get.
 *
 * ⚠ **Colours only.** Payload posts the whole `clients` form, admin-only fields
 * included. Every other field of the message is ignored and nothing is stored.
 *
 * ⚠ **Nothing here may enter `Widget.tsx`'s import graph** — a host page can open
 * no session, so the embed must not carry the code that would serve one
 * (`src/Widget.standalone.test.ts`).
 *
 * A no-op on every page load but a verified `clients` session, which is all of them.
 */
export function startClientsPreview(repaint: (brand: PaletteRoles) => void): () => void {
  if (!livePreview.active || livePreview.scope !== 'clients') return () => {}

  let brand: PaletteRoles = {}

  const paint = () => {
    repaint(brand)
    // After every repaint, so the note under each picker names the colour that is
    // on screen rather than the one before it.
    window.parent.postMessage(
      { roles: paletteReport(brand), type: PALETTE_REPORT_MESSAGE },
      SERVER_ORIGIN,
    )
  }

  const onMessage = (event: MessageEvent<Incoming>) => {
    // The admin's own origin, and no other. A page that frames this one cannot
    // repaint it by shouting the right shape.
    if (event.origin !== SERVER_ORIGIN) return

    const message = event.data

    if (message?.type === 'payload-live-preview' && message.collectionSlug === 'clients') {
      brand = brandFrom(message.data)
      paint()

      return
    }

    if (message?.type === PREVIEW_MODE_MESSAGE && isTheme(message.mode)) {
      applyTheme(message.mode)
      paint()
    }
  }

  window.addEventListener('message', onMessage)

  // Payload posts the current form state once it hears this, so the preview opens
  // on the colours the manager is looking at rather than on the saved ones.
  ready({ serverURL: SERVER_ORIGIN })

  return () => window.removeEventListener('message', onMessage)
}

const isTheme = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark'
