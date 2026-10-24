import { describe, expect, it } from 'vitest'

import { submitPanelLayout } from './submit-panel'

describe('submitPanelLayout', () => {
  it('slides in from the right on a wide widget', () => {
    expect(submitPanelLayout({ isWide: true, reviewing: false })).toEqual({
      direction: 'right',
      className: undefined,
    })
  })

  it('rises from the bottom on a narrow widget, sized to its content', () => {
    const layout = submitPanelLayout({ isWide: false, reviewing: false })

    expect(layout.direction).toBe('bottom')
    expect(layout.className).toContain('!h-auto')
  })

  it('shrinks to a bar on review, so the listing behind it shows', () => {
    expect(submitPanelLayout({ isWide: true, reviewing: true }).className).toContain('!h-auto')
  })
})
