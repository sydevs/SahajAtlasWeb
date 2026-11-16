import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { flagUrl } from './flag-url'

describe('flagUrl', () => {
  it('is an absolute URL, so a host page never resolves it against its own origin', () => {
    expect(flagUrl('gb')).toMatch(/^[a-z]+:\/\/.*\/flags\/gb\.svg$/)
  })

  it('lowercases the code, as the vendored files are named', () => {
    expect(flagUrl('IS')).toBe(flagUrl('is'))
    expect(flagUrl('IS')).toMatch(/\/flags\/is\.svg$/)
  })

  it('never names a third party', () => {
    expect(flagUrl('in')).not.toContain('pages.dev')
  })

  it.each(['', 'g', 'gbr', '../x', 'g/', 'g.', '1a'])('refuses %j', (code) => {
    expect(flagUrl(code)).toBeUndefined()
  })

  it('points at files that ship in public/flags', () => {
    for (const code of ['gb', 'in', 'is', 'it', 'us', 'ru', 'ua', 'cz', 'hu']) {
      expect(existsSync(resolve(__dirname, `../../public/flags/${code}.svg`))).toBe(true)
    }
    expect(existsSync(resolve(__dirname, '../../public/flags/LICENSE.md'))).toBe(true)
  })
})
