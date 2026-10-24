import { describe, expect, it } from 'vitest'

import { submitPanelLayout } from './submit-panel'

describe('submitPanelLayout', () => {
  it('slides in from the right on a wide widget, full height while it fills a step', () => {
    const layout = submitPanelLayout(true, false)

    expect(layout.direction).toBe('right')
    expect(layout.className ?? '').not.toContain('!h-auto')
  })

  it('rises from the bottom on a narrow widget, sized to its content', () => {
    const layout = submitPanelLayout(false, false)

    expect(layout.direction).toBe('bottom')
    expect(layout.className).toContain('!h-auto')
  })

  it('docks to a bar on a wide widget once its content is compact, with no :has()', () => {
    const { className } = submitPanelLayout(true, true)

    expect(className).toContain('!h-auto')
    expect(className).not.toContain('has-')
  })
})
