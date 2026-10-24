import { describe, expect, it } from 'vitest'

import { submitPanelLayout } from './submit-panel'

describe('submitPanelLayout', () => {
  it('slides in from the right on a wide widget', () => {
    expect(submitPanelLayout(true).direction).toBe('right')
  })

  it('rises from the bottom on a narrow widget, sized to its content', () => {
    const layout = submitPanelLayout(false)

    expect(layout.direction).toBe('bottom')
    expect(layout.className).toContain('!h-auto')
  })

  it('docks to a bar on a wide widget only while its content is compact', () => {
    const { className } = submitPanelLayout(true)

    expect(className).toContain('has-data-compact:!h-auto')
    expect(className).not.toMatch(/(^| )!h-auto/)
  })
})
