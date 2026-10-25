import { describe, expect, it } from 'vitest'

import { staticMapUrl } from './static-map'

describe('staticMapUrl', () => {
  it('pins the point in the atlas style, at twice the pixel size', () => {
    const url = staticMapUrl({
      longitude: -0.17,
      latitude: 50.82,
      width: 340,
      height: 120,
      token: 'pk.x',
    })

    expect(url).toBe(
      'https://api.mapbox.com/styles/v1/sydevadmin/ck7g6nag70rn11io09f45odkq/static/' +
        'pin-l+e9704e(-0.17000,50.82000)/-0.17000,50.82000,15,0/340x120@2x?access_token=pk.x',
    )
  })

  it('draws nothing without a token', () => {
    expect(staticMapUrl({ longitude: 0, latitude: 0, width: 1, height: 1, token: '' })).toBeNull()
  })
})
