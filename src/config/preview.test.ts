import { describe, it, expect } from 'vitest'

import { readPreviewParams } from './preview'

describe('readPreviewParams', () => {
  it('returns null for any route other than /preview', () => {
    expect(readPreviewParams('/', '')).toBeNull()
    expect(readPreviewParams('/india/pune/507', '?collection=events&id=507')).toBeNull()
  })

  it('captures collection/id/secret from the /preview boot URL', () => {
    expect(readPreviewParams('/preview', '?collection=events&id=507&secret=s3cr3t')).toEqual({
      active: true,
      collection: 'events',
      id: '507',
      secret: 's3cr3t',
    })
  })

  it('accepts the regions collection', () => {
    expect(readPreviewParams('/preview', '?collection=regions&id=42&secret=x')).toMatchObject({
      collection: 'regions',
      id: '42',
    })
  })

  it('nulls an unknown or missing collection (unsupported → handled downstream)', () => {
    expect(readPreviewParams('/preview', '?collection=venues&id=1&secret=x')?.collection).toBeNull()
    expect(readPreviewParams('/preview', '?id=1&secret=x')?.collection).toBeNull()
  })

  it('leaves id/secret null when absent but still marks preview active', () => {
    expect(readPreviewParams('/preview', '')).toEqual({
      active: true,
      collection: null,
      id: null,
      secret: null,
    })
  })
})
