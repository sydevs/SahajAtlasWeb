import { describe, it, expect } from 'vitest'

import { readLivePreviewParams } from './session'

describe('readLivePreviewParams', () => {
  it('returns null for any route other than /preview', () => {
    expect(readLivePreviewParams('/', '')).toBeNull()
    expect(readLivePreviewParams('/india/pune/507', '?collection=events&id=507')).toBeNull()
  })

  it('captures collection/id/token from the boot URL', () => {
    expect(readLivePreviewParams('/preview', '?collection=events&id=507&secret=s3cr3t')).toEqual({
      active: true,
      collection: 'events',
      id: '507',
      token: 's3cr3t',
    })
  })

  it('accepts the regions collection', () => {
    expect(readLivePreviewParams('/preview', '?collection=regions&id=42&secret=x')).toMatchObject({
      collection: 'regions',
      id: '42',
    })
  })

  it('nulls an unknown or missing collection (unsupported → handled downstream)', () => {
    expect(
      readLivePreviewParams('/preview', '?collection=venues&id=1&secret=x')?.collection,
    ).toBeNull()
    expect(readLivePreviewParams('/preview', '?id=1&secret=x')?.collection).toBeNull()
  })

  it('leaves id/token null when absent but still marks the session active', () => {
    expect(readLivePreviewParams('/preview', '')).toEqual({
      active: true,
      collection: null,
      id: null,
      token: null,
    })
  })
})
