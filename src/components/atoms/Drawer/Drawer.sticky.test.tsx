import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DrawerBody, DrawerFooter, DrawerSlotsProvider } from './Drawer'

/**
 * What a `sticky` footer and the body it covers agree on (#320). `DrawerFooter`'s own
 * docblock carries why each value is what it is.
 *
 * ⚠ The measured half — that the footer's height reaches the body, and that the bar's
 * bottom edge is the viewport bottom — needs a browser. jsdom has no `ResizeObserver`
 * and reports every rect as zero, so these assert the two seams that carry the numbers.
 *
 * ⚠ **A harness that composes `DrawerFooter` straight under `DrawerContent` cannot see
 * the defect this fixes**, and one did: the bar measured flush there while the app put
 * it 25px high, because the app's crossfade layers (#312) sit in between and `absolute`
 * took one of them as its containing block. Hence the `fixed` assertion below, and hence
 * measuring a deployed preview rather than an isolated story.
 */
const render = (children: React.ReactNode) =>
  renderToStaticMarkup(
    <DrawerSlotsProvider direction="bottom" mode="anchored">
      {children}
    </DrawerSlotsProvider>,
  )

const footer = (sticky: boolean) =>
  render(
    <DrawerFooter className="px-4 py-3" sticky={sticky}>
      <button type="button">Register</button>
    </DrawerFooter>,
  )

describe('DrawerFooter — sticky', () => {
  it('offsets by the live sheet top, with nothing taken off it', () => {
    expect(footer(true)).toContain('bottom-[var(--sy-sheet-top,0px)]')
  })

  // The offset cancels vaul's translate only when measured from the sheet's own box.
  // `absolute` takes a crossfade layer instead, which is the sheet's content box.
  it('resolves against the sheet, not the nearest positioned ancestor', () => {
    const markup = footer(true)

    expect(markup).toContain('fixed')
    expect(markup).not.toContain('absolute')
  })

  // The inset rides a spacer rather than the footer's own padding, which a caller's
  // `py-*` merges away — `py-3` above is what makes this assertion mean something.
  it('clears the home indicator', () => {
    expect(footer(true)).toContain('h-[env(safe-area-inset-bottom)]')
  })

  it('does neither when it is an ordinary in-flow footer', () => {
    const markup = footer(false)

    expect(markup).not.toContain('--sy-sheet-top')
    expect(markup).not.toContain('safe-area-inset-bottom')
  })
})

describe('DrawerBody', () => {
  // Zero where no sticky footer publishes a height, so every other body is unchanged.
  it('ends its content at the published footer height', () => {
    expect(render(<DrawerBody>content</DrawerBody>)).toContain('after:h-[var(--sy-footer-h,0px)]')
  })

  // FilterView, ShareView, RegistrationView and CalendarView all pass `p-4`, which
  // tailwind-merge resolves against a slot's own `pb-*`. The clearance has to survive
  // the first of them to gain a sticky footer.
  it('keeps the clearance a caller shorthand cannot merge away', () => {
    const markup = render(<DrawerBody className="p-4">content</DrawerBody>)

    expect(markup).toContain('after:h-[var(--sy-footer-h,0px)]')
    expect(markup).toContain('p-4')
  })
})
