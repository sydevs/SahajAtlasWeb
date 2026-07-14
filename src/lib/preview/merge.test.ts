import { describe, it, expect } from 'vitest'

import { mergePreviewData } from './merge'

describe('mergePreviewData', () => {
  it('returns the base unchanged when there is no overlay', () => {
    const base = { title: 'A' }

    expect(mergePreviewData(base, null)).toBe(base)
    expect(mergePreviewData(base, undefined)).toBe(base)
  })

  it('keeps a base field the overlay omits, but lets a sibling edit through', () => {
    type Doc = { title: string; subtitle?: string }
    const base: Doc = { title: 'A', subtitle: 'keep me' }

    expect(mergePreviewData(base, { title: 'A2' })).toEqual({ title: 'A2', subtitle: 'keep me' })
  })

  it('keeps a populated relation when the overlay collapses it to the same id', () => {
    type Doc = { title: string; region: { id: number; name: string } | number }
    const base: Doc = { title: 'A', region: { id: 5, name: 'Voronezh' } }

    expect(mergePreviewData(base, { title: 'A', region: 5 })).toEqual({
      title: 'A',
      region: { id: 5, name: 'Voronezh' },
    })
  })

  it('passes a genuinely changed relation id through (the hook re-populates it)', () => {
    type Doc = { region: { id: number; name: string } | number }
    const base: Doc = { region: { id: 5, name: 'Voronezh' } }

    expect(mergePreviewData(base, { region: 9 })).toEqual({ region: 9 })
  })

  it('lets an explicit null clear a field (null is a real edit, not an omission)', () => {
    type Doc = { subtitle: string | null }
    const base: Doc = { subtitle: 'A' }

    expect(mergePreviewData(base, { subtitle: null })).toEqual({ subtitle: null })
  })

  it('recurses into nested groups', () => {
    type Doc = { schedule: { start: string; end: string } }
    const base: Doc = { schedule: { start: '9', end: '10' } }

    expect(mergePreviewData(base, { schedule: { start: '11', end: '10' } })).toEqual({
      schedule: { start: '11', end: '10' },
    })
  })
})
