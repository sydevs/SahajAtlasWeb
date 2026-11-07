import { describe, expect, it } from 'vitest'

import { THEME_COLOR } from './theme-color'

import { readRepoSource } from '@/test-support/repo-source'

describe('THEME_COLOR', () => {
  it("is each theme's --background, light block first and dark block second", () => {
    const declared = [
      ...readRepoSource('src/styles/globals.css').matchAll(/--background:\s*([^;]+);/g),
    ].map((match) => `hsl(${match[1].trim()})`)

    expect(declared).toEqual([THEME_COLOR.light, THEME_COLOR.dark])
  })
})
