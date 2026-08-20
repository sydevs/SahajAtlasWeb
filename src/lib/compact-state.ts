import type { Destination } from './embed-slot'

/**
 * Everything the compact card needs, assembled once by whichever entry could measure the slot
 * (issue #161).
 *
 * One object rather than a flag and three satellites, so the impossible combinations cannot be
 * expressed: a `link` card has no `autoOpen` because there is no surface to open, and an
 * `overlay` card has no href because it never leaves the page. Both entries build this; `App`
 * only reads it.
 */
export type CompactAction =
  | { kind: 'overlay'; autoOpen: boolean }
  | { kind: 'link'; href: string }

export type CompactState = {
  action: CompactAction
  /** See `CompactCardProps.fill` — true only when the host gave the element a height. */
  fill: boolean
  /** `autoOpen` hoisted for the provider, false for a link. */
  autoOpen: boolean
}

/** Build the state from a resolved destination, or `null` when the interface fits. */
export function compactState(input: {
  destination: Destination
  href: string
  fill: boolean
  fromPage: boolean
}): CompactState | null {
  const { destination, href, fill, fromPage } = input

  if (destination.kind === 'none') return null

  // A navigation on mount is a redirect nobody asked for, and a browser would block it as a
  // popup anyway — so a deep link into a framed embed leaves the route behind the button
  // rather than following it.
  if (destination.kind === 'link') {
    return { action: { kind: 'link', href }, fill, autoOpen: false }
  }

  return { action: { kind: 'overlay', autoOpen: fromPage }, fill, autoOpen: fromPage }
}
