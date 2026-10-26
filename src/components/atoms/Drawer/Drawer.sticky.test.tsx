import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DrawerFooter, DrawerSlotsProvider } from './Drawer'

/**
 * What pins a sticky footer to the viewport edge (#320).
 *
 * The sheet is a full-height panel vaul translates down by the snap offset, so the
 * footer's `bottom` is that same offset — and an absolutely positioned child resolves
 * against its ancestor's PADDING box, so the sheet's own
 * `pb-[calc(var(--sy-frame-h)*0.03)]` is already inside the distance measured. Measured
 * in Chromium at 390×844, the bar's bottom edge was the viewport bottom at all three
 * snaps. Subtracting that 3% — the fix a UX audit proposed for a float that does not
 * happen — lands it 25px BELOW the fold with the body showing through. The assertion is
 * the whole variable, unsubtracted.
 */
const footer = (sticky: boolean) =>
  renderToStaticMarkup(
    <DrawerSlotsProvider direction="bottom" mode="anchored">
      <DrawerFooter className="px-4 py-3" sticky={sticky}>
        <button type="button">Register</button>
      </DrawerFooter>
    </DrawerSlotsProvider>,
  )

describe('DrawerFooter — sticky', () => {
  it('offsets by the live sheet top, with nothing taken off it', () => {
    expect(footer(true)).toContain('bottom-[var(--sy-sheet-top,0px)]')
  })

  // `viewport-fit=cover` (index.html) runs the layout viewport under the home indicator,
  // so a bar flush with it puts its control in the gesture area. The inset rides a spacer
  // rather than the footer's own padding, which a caller's `py-*` merges away — `py-3`
  // above is what makes this assertion mean something.
  it('clears the home indicator', () => {
    expect(footer(true)).toContain('h-[env(safe-area-inset-bottom)]')
  })

  it('does neither when it is an ordinary in-flow footer', () => {
    const markup = footer(false)

    expect(markup).not.toContain('--sy-sheet-top')
    expect(markup).not.toContain('safe-area-inset-bottom')
  })
})
