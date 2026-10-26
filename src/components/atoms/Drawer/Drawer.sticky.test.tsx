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
    expect(render(<DrawerBody>content</DrawerBody>)).toContain('pb-[var(--sy-footer-h,0px)]')
  })
})
