import { describe, it, expect } from 'vitest'

import { validateWebUrl } from './url'

describe('validateWebUrl', () => {
  it('returns http(s) absolute URLs unchanged', () => {
    expect(validateWebUrl('https://atlas.example/belgium')).toBe('https://atlas.example/belgium')
    expect(validateWebUrl('http://x.test')).toBe('http://x.test')
  })

  it('rejects non-http(s), relative, empty, and nullish', () => {
    expect(validateWebUrl('javascript:alert(1)')).toBeUndefined()
    expect(validateWebUrl('/belgium/flanders')).toBeUndefined()
    expect(validateWebUrl('')).toBeUndefined()
    expect(validateWebUrl(null)).toBeUndefined()
    expect(validateWebUrl(undefined)).toBeUndefined()
  })
})
