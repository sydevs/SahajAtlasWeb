import { describe, expect, it } from 'vitest'

import { fieldChrome } from './Select'

const classes = (props: Parameters<typeof fieldChrome>[0]) => fieldChrome(props).split(' ')

// `field-height` is our own utility, so only its registration in `@/styles/tv` lets a height
// replace it; otherwise the two ship side by side and stylesheet order picks the winner.
describe('the field height', () => {
  it('sizes every single-line field', () => {
    expect(classes({})).toContain('field-height')
    expect(classes({ trigger: true })).toContain('field-height')
  })

  it('gives way to a textarea, which grows with its content', () => {
    expect(classes({ multiline: true })).toContain('h-auto')
    expect(classes({ multiline: true })).not.toContain('field-height')
  })
})
