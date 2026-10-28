import { describe, expect, it } from 'vitest'

import { submitSheetChrome } from './submit-panel'

describe('submitSheetChrome', () => {
  it('docks to the bottom corner on a wide widget, clear of the map pin, with no :has()', () => {
    const { direction, className } = submitSheetChrome(true)

    expect(direction).toBe('right')
    // `!top-auto` twice: the bare class, and again at `lg`, where the variant re-insets.
    expect(className).toContain('!top-auto')
    expect(className).toContain('lg:!top-auto')
    expect(className).toContain('!h-auto')
    expect(className).toContain('max-h-[70%]')
    expect(className).not.toContain('has-')
  })

  it('rises from the bottom on a narrow widget, sized to its content', () => {
    const { direction, className } = submitSheetChrome(false)

    expect(direction).toBe('bottom')
    expect(className).toContain('!h-auto')
    expect(className).toContain('max-h-[70%]')
  })
})
