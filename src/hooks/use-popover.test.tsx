import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { OPEN_POPOVER_ATTRIBUTE, usePopover } from './use-popover'

// The panel only mounts while open, so whatever its props carry is what an open popover shows the
// drawer's Escape ladder (`popupOwnsEscape`). SSR renders the props without opening anything.
function Panel() {
  const { getFloatingProps } = usePopover({ role: 'dialog' })

  return <div {...getFloatingProps({ 'aria-label': 'When' })} />
}

describe('usePopover', () => {
  it('marks its panel as an open popover, keeping the caller’s own props', () => {
    const html = renderToStaticMarkup(<Panel />)

    expect(html).toContain(`${OPEN_POPOVER_ATTRIBUTE}=""`)
    expect(html).toContain('aria-label="When"')
    expect(html).toContain('role="dialog"')
  })
})
