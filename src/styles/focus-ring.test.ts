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
  it('draws inside the control, with a band of the panel colour', () => {
    const body = utility('focus-outline')

    expect(body).toMatch(/outline: 2px solid var\(--color-focus/)
    expect(body).toContain('outline-offset: -2px')
    expect(body).toContain('inset 0 0 0 4px hsl(var(--background))')
  })

  it('draws on keyboard focus alone, on the control or inside its box', () => {
    expect(utility('focus-ring')).toMatch(/&:focus-visible\s*{\s*@apply focus-outline;/)
    expect(utility('focus-ring-within')).toMatch(
      /&:has\(:focus-visible\)\s*{\s*@apply focus-outline;/,
    )
  })

  it('is the only focus indicator a component draws', () => {
    // A ring in the focus colour, behind any state: `focus-visible:`, `has-[:focus-visible]:`…
    const OWN_RING = /\bring-focus\b|focus(?:-visible|-within)?\]?:(?:ring|outline)-\d/
    const drifted = sourceFiles({ extensions: ['.ts', '.tsx'] }).filter((path) =>
      OWN_RING.test(readSourceWithoutComments(path)),
    )

    expect(drifted).toEqual([])
  })
})
