import { describe, expect, it } from 'vitest'

import { type NavTranslate, backLabel } from './nav-names'

const t = ((key: string, options?: { place?: string; title?: string }) => {
  const value = options?.place ?? options?.title

  return value ? `${key}:${value}` : key
}) as NavTranslate

const naming = {
  t,
  regionNames: new Map([['gb', 'United Kingdom']]),
  titles: new Map([[711, 'Monday class']]),
}

describe('backLabel', () => {
  it('names the root in words a visitor knows', () => {
    expect(backLabel('/', naming)).toBe('common.chrome.back_to_world_map')
  })

  it('names a region from the tree, and never shows a raw slug', () => {
    expect(backLabel('/gb', naming)).toBe('common.chrome.back_to:United Kingdom')
    expect(backLabel('/fr', naming)).toBe('common.chrome.back_to:FR')
    expect(backLabel('/united-kingdom', naming)).toBe('common.chrome.back_to:United Kingdom')
  })

  it('names search results by the place searched', () => {
    expect(backLabel('/search?q=Prague%2C+Czechia&center=1%2C2', naming)).toBe(
      'common.chrome.back_to_results_near:Prague',
    )
    expect(backLabel('/search', naming)).toBe('common.chrome.back_to_results')
  })

  it('names a class by its title, and says "class" when the title is not cached', () => {
    expect(backLabel('/gb/711', naming)).toBe('common.chrome.back_to:Monday class')
    expect(backLabel('/gb/712', naming)).toBe('common.chrome.back_to_class')
  })
})
