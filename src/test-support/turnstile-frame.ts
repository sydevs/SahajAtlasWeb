import { vi } from 'vitest'

import { type ChallengeEvent, challengeMessage, parseChallengeCommand } from '@/lib/turnstile-frame'

/**
 * Stands in for the challenge PAGE, never for our own hook (#343).
 *
 * `useTurnstile` mounts a frame on the widget's origin and waits for its `postMessage`
 * handshake, so this speaks that protocol from the other side. What the specs using it are
 * for is the form's own wiring — the token reaching Submit, and a failed submit asking for a
 * fresh challenge — and mocking the hook would skip exactly that.
 *
 * Call it after the form has mounted: the frame is appended in an effect.
 *
 * @param container the element the form rendered into
 */
export function challengeFrameStub(container: ParentNode) {
  const frame = container.querySelector('iframe')

  if (!frame?.contentWindow) throw new Error('no Turnstile challenge frame')

  let resets = 0

  vi.spyOn(frame.contentWindow, 'postMessage').mockImplementation(((data: unknown) => {
    if (parseChallengeCommand(data)) resets += 1
  }) as Window['postMessage'])

  return {
    /** The challenge renders and is solved, which is what hands the form its token. */
    solve: (token = 'tok-live') => {
      sendFromFrame(frame, { type: 'ready' })
      sendFromFrame(frame, { type: 'token', token })
    },
    /** How many times the form asked the frame for a fresh challenge. */
    resetCount: () => resets,
  }
}

/**
 * Dispatches one message as the challenge page would, for a spec driving the frame directly.
 *
 * ⚠ The origin is read off the frame's own `src`. The hook resolves that URL against its
 * module URL, so hard-coding one here would make the hook's own origin check pass or fail for
 * a reason unrelated to what the spec is testing. `overrides` is what lets a case send a
 * deliberately wrong source, origin or shape.
 */
export function sendFromFrame(
  frame: HTMLIFrameElement,
  message: ChallengeEvent,
  overrides: MessageEventInit = {},
) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: challengeMessage(message),
      origin: new URL(frame.src).origin,
      source: frame.contentWindow,
      ...overrides,
    }),
  )
}
