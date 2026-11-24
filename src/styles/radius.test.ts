import { describe, expect, it } from 'vitest'

import { readSourceWithoutComments, sourceFiles } from '@/test-support/source-tree'

/**
 * One corner rule: `rounded-lg` (8px), `rounded-2xl` (16px) and `rounded-full`. Every other step
 * is deleted from `@theme`, so any other `rounded` class generates NOTHING — it stays in the DOM,
 * square, and lint and typecheck stay green. This is the only thing that notices one.
 */

// Every `rounded` class token, optionally behind variants (`md:`, `first:`).
const ROUNDED = /(?<=^|[\s"'`:])rounded(?:-[^\s"'`]+)?(?=$|[\s"'`])/gm
const SIDE = /^rounded-(?:s|e|t|b|l|r|ss|se|es|ee|tl|tr|bl|br)(?=-|$)/
// What the theme still draws. Bare `rounded` and a bare side name read the deleted default step.
const DRAWN = /^-(?:lg|2xl|full|none|\[.+\])!?$/

const drawsNothing = (token: string) => !DRAWN.test(token.replace(SIDE, '').replace(/^rounded/, ''))

describe('the corner rule', () => {
  it('leaves only the 8 and 16px steps in the theme', () => {
    const sheet = readSourceWithoutComments('styles/globals.css')
    const radii = [...sheet.matchAll(/^\s*(--radius[\w-]*):/gm)].map(([, name]) => name)

    expect(radii).toEqual(['--radius-lg', '--radius-2xl'])
  })

  it('never names a deleted step, which would draw a square corner', () => {
    const offenders = sourceFiles({ includeStories: true }).flatMap((path) =>
      [...readSourceWithoutComments(path).matchAll(ROUNDED)]
        .map(([token]) => token)
        .filter(drawsNothing)
        .map((token) => `${path}: ${token}`),
    )

    expect(offenders).toEqual([])
  })
})
