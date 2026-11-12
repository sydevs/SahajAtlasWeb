import { describe, expect, it } from 'vitest'

import { addLinkFromParams, fixFromParams } from '.'

const query = (search: string) => new URLSearchParams(search)

describe('addLinkFromParams', () => {
  it.each([
    ['place', 'where'],
    ['time', 'when'],
    ['details', 'details'],
    ['check', 'review'],
  ])('opens ?step=%s on the %s step', (name, step) => {
    expect(addLinkFromParams(query(`step=${name}`))).toEqual({ step })
  })

  it('reads the stage names in any case', () => {
    expect(addLinkFromParams(query('step=Time'))).toEqual({ step: 'when' })
  })

  it('opens the sign-up answer on Details, where it is asked', () => {
    expect(addLinkFromParams(query('signup=elsewhere'))).toEqual({
      step: 'details',
      signup: 'elsewhere',
    })
  })

  it('opens a duplicate on Check, where the suggestion shows', () => {
    expect(addLinkFromParams(query('duplicate=939'))).toEqual({ step: 'review', duplicateOf: 939 })
  })

  it('keeps an explicit stage beside the other answers', () => {
    expect(addLinkFromParams(query('step=check&signup=elsewhere'))).toEqual({
      step: 'review',
      signup: 'elsewhere',
    })
  })

  it('is no link for a query that names none, or only values it does not know', () => {
    expect(addLinkFromParams(query(''))).toBeNull()
    expect(addLinkFromParams(query('sort=soonest'))).toBeNull()
    expect(addLinkFromParams(query('step=review&signup=maybe&duplicate=abc'))).toBeNull()
    // An inherited key is not a stage.
    expect(addLinkFromParams(query('step=constructor'))).toBeNull()
    expect(addLinkFromParams(query('duplicate=-4'))).toBeNull()
  })
})

describe('fixFromParams', () => {
  it.each([
    ['time', 'when'],
    ['place', 'where'],
    ['details', 'details'],
    ['nobody', 'nobody'],
    ['stopped', 'stopped'],
    ['other', 'other'],
  ])('opens ?fix=%s on the %s answer', (name, intent) => {
    expect(fixFromParams(query(`fix=${name}`))).toBe(intent)
  })

  it('is no answer for a missing or unknown value', () => {
    expect(fixFromParams(query(''))).toBeNull()
    expect(fixFromParams(query('fix=when'))).toBeNull()
    expect(fixFromParams(query('fix=toString'))).toBeNull()
  })
})
