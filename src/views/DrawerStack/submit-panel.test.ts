import { describe, expect, it } from 'vitest'

import { submitSheetChrome } from './submit-panel'

describe('submitSheetChrome', () => {
  it('slides in from the right on a wide widget, full height while it fills a step', () => {
    const chrome = submitSheetChrome(true, false)

    expect(chrome.direction).toBe('right')
    expect(chrome.className ?? '').not.toContain('!h-auto')
  })

  it('rises from the bottom on a narrow widget, sized to its content', () => {
    const chrome = submitSheetChrome(false, false)

    expect(chrome.direction).toBe('bottom')
    expect(chrome.className).toContain('!h-auto')
  })

  it('docks to a bar on a wide widget once its content is compact, with no :has()', () => {
    const { className } = submitSheetChrome(true, true)

    expect(className).toContain('!h-auto')
    expect(className).not.toContain('has-')
  })
})
