/**
 * PROTOTYPE (`ux/embed-inline`): the way back for a visitor an iframe embed sent to this page.
 *
 * When a framed inline card cannot open a full view in place (iPhone, or no `allow="fullscreen"`),
 * it sends the tab here with `?from=frame&return=<host origin>` (`lib/full-view.ts`). This reads
 * both once, before React mounts, and takes them out of the URL so no view carries them on into
 * the routes it builds. A boot singleton, like `config/embed.ts`.
 */
import { FROM_FRAME_PARAM, RETURN_PARAM, siteName } from '@/lib/full-view'
import { requestSearchFocus } from '@/lib/pending-focus'

export type ReturnTo = {
  /** The host's name for the bar, "shrimataji.org". */
  host: string
  /** Where the bar links when there is no history to go back through. Checked before use. */
  href: string
  /** Whether a frame on that host sent the visitor here, so Back returns to it. */
  fromFrame: boolean
  /** Focus the search field once the interface is up. */
  focusSearch: boolean
}

const returnTo: { value: ReturnTo | null } = { value: null }

export default returnTo

/** Reads and strips the parameters. A no-op on every page load that has none. */
export function captureReturnTo(): void {
  const url = new URL(window.location.href)
  const href = url.searchParams.get(RETURN_PARAM)
  const fromFrame = url.searchParams.get(FROM_FRAME_PARAM) === 'frame'

  if (!href && !fromFrame) return

  let host = ''

  try {
    if (href) host = siteName(new URL(href).hostname)
  } catch {
    host = ''
  }

  returnTo.value = {
    host,
    href: href ?? '',
    fromFrame,
    focusSearch: url.searchParams.get('focus') === 'search',
  }
  // The keyboard can't survive a page load, but the field can still be ready to type in.
  if (returnTo.value.focusSearch) requestSearchFocus()
  url.searchParams.delete(RETURN_PARAM)
  url.searchParams.delete(FROM_FRAME_PARAM)
  url.searchParams.delete('focus')
  window.history.replaceState(window.history.state, '', url.toString())
}
