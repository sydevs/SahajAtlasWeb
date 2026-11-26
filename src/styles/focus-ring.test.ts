import { describe, expect, it } from 'vitest'

import { readSourceWithoutComments, sourceFiles } from '@/test-support/source-tree'

/**
 * Keyboard focus looked three ways until every control drew one `focus-ring` utility, and the
 * tap areas reached a touchscreen laptop's mouse until `touch-target` asked the same hardware
 * question as `useCoarsePointer`. Both are CSS, so nothing else in the unit lane would notice
 * either one drifting back.
 */

const globals = readSourceWithoutComments('styles/globals.css')

const utility = (name: string) => {
  const start = globals.indexOf(`@utility ${name} {`)

  expect(start, `@utility ${name}`).toBeGreaterThan(-1)
  let depth = 0

  for (let index = globals.indexOf('{', start); index < globals.length; index++) {
    if (globals[index] === '{') depth++
    if (globals[index] === '}' && --depth === 0) return globals.slice(start, index + 1)
  }
  throw new Error(`unclosed @utility ${name}`)
}

describe('touch-target', () => {
  it('applies on a touch screen only, the query useCoarsePointer reads', () => {
    expect(utility('touch-target')).toContain('@media (hover: none) and (pointer: coarse)')
  })
})

describe('focus-ring', () => {
  it('draws on :focus-visible alone, inside the control, with a band of the panel colour', () => {
    const body = utility('focus-ring')

    expect(body).toMatch(/&:focus-visible\s*{[^}]*outline: 2px solid var\(--color-focus/)
    expect(body).toContain('outline-offset: -2px')
    expect(body).toContain('inset 0 0 0 4px hsl(var(--background))')
  })

  it('is the only focus indicator a component draws', () => {
    const drifted = sourceFiles({ extensions: ['.ts', '.tsx'] }).filter((path) =>
      /focus-visible:(?:ring|outline)-|focus:(?:ring|outline)-/.test(
        readSourceWithoutComments(path),
      ),
    )

    expect(drifted).toEqual([])
  })
})
