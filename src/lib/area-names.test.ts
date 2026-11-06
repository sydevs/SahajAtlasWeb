import { describe, expect, it } from 'vitest'

import { areaKey, areaLabel } from './area-names'

describe('areaLabel', () => {
  it('names the part of town when the town is the page itself', () => {
    expect(areaLabel({ place: 'London', neighborhood: 'Balham' }, 'London')).toBe('Balham')
    expect(areaLabel({ place: 'Paris', locality: '15th arrondissement' }, 'Paris')).toBe(
      '15th arrondissement',
    )
  })

  it('names the town when it differs from the page', () => {
    expect(areaLabel({ place: 'Croydon' }, 'London')).toBe('Croydon')
    expect(areaLabel({ place: 'Edgware', neighborhood: 'Queensbury' }, 'London')).toBe('Edgware')
    expect(areaLabel({ place: 'London', neighborhood: 'Balham' }, 'United Kingdom')).toBe('London')
  })

  it('falls back to the locality, then leaves today’s label', () => {
    expect(areaLabel({ place: 'New York', locality: 'Manhattan' }, 'New York')).toBe('Manhattan')
    expect(areaLabel({ place: 'London' }, 'london')).toBeUndefined()
    expect(areaLabel(null, 'London')).toBeUndefined()
  })
})

describe('areaKey', () => {
  it('rounds to about ten metres, so one venue is one lookup', () => {
    expect(areaKey([-0.15231, 51.44321])).toBe(areaKey([-0.15234, 51.44324]))
  })
})
