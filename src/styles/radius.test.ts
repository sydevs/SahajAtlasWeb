import { describe, expect, it } from 'vitest'

import { readSourceWithoutComments, sourceFiles } from '@/test-support/source-tree'

/**
 * One corner rule: 8px (`rounded-lg`) inside the panel, 16px (`rounded-2xl`) for panels, sheets
 * and menus, `rounded-full` for pills. The 2, 4, 6 and 12px steps are deleted from `@theme`, so
 * a bare `rounded`, `rounded-sm`, `rounded-md` or `rounded-xl` now generates NOTHING — the class
 * stays in the DOM, square, and lint and typecheck stay green. This is the only thing that
 * notices one coming back.
 */

const SIDES = '(?:-(?:s|e|t|b|l|r|ss|se|es|ee|tl|tr|bl|br))?'
// A whole class token, optionally behind variants (`md:`, `first:`), ending at a delimiter.
const DELETED_STEP = new RegExp(
  `(?<=^|[\\s"'\`:])rounded${SIDES}(?:-(?:sm|md|xl))?(?=$|[\\s"'\`])`,
  'gm',
)

describe('the corner rule', () => {
  it('leaves only the 8 and 16px steps in the theme', () => {
    const sheet = readSourceWithoutComments('styles/globals.css')
    const radii = [...sheet.matchAll(/^\s*(--radius[\w-]*):/gm)].map(([, name]) => name)

    expect(radii).toEqual(['--radius-lg', '--radius-2xl'])
  })

  it('never names a deleted step, which would draw a square corner', () => {
    const offenders = sourceFiles({ includeStories: true }).flatMap((path) =>
      [...readSourceWithoutComments(path).matchAll(DELETED_STEP)].map(
        ([token]) => `${path}: ${token}`,
      ),
    )

    expect(offenders).toEqual([])
  })
})
