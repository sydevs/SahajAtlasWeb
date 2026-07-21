import { describe, it, expect } from 'vitest'

import { RegistrationSchema } from './registration'

const base = { startingAt: '2026-07-04T09:30:00Z', name: 'Jane Doe', email: 'jane@example.com' }

describe('RegistrationSchema', () => {
  it('parses a valid registration and coerces the start date', () => {
    const parsed = RegistrationSchema.parse(base)

    expect(parsed.startingAt).toBeInstanceOf(Date)
  })

  it('accepts accented names', () => {
    const parsed = RegistrationSchema.parse({ ...base, name: 'José Müller' })

    expect(parsed.name).toBe('José Müller')
  })

  it('rejects a name containing digits', () => {
    expect(() => RegistrationSchema.parse({ ...base, name: 'Agent007' })).toThrow()
  })

  it('rejects an invalid email', () => {
    expect(() => RegistrationSchema.parse({ ...base, email: 'not-an-email' })).toThrow()
  })
})

// The `questions` payload must match SahajCloud's EVENT_REGISTRATION_QUESTIONS
// contract (keys ∈ the known names, string values); a non-conforming payload 400s
// server-side, so we reject it client-side too rather than let it reach the wire.
describe('RegistrationSchema questions', () => {
  it('accepts answers keyed by enabled question names', () => {
    const parsed = RegistrationSchema.parse({
      ...base,
      questions: { priorExperience: 'A little', guests: '2' },
    })

    expect(parsed.questions).toEqual({ priorExperience: 'A little', guests: '2' })
  })

  it('accepts an empty-string answer for an enabled-but-unanswered question', () => {
    // The form submits '' for enabled-but-blank fields; SahajCloud accepts it and
    // drops the blank from the notification email.
    expect(RegistrationSchema.parse({ ...base, questions: { healthInfo: '' } }).questions).toEqual({
      healthInfo: '',
    })
  })

  it('omits questions entirely when the event enables none', () => {
    expect(RegistrationSchema.parse(base).questions).toBeUndefined()
  })

  it('rejects a key outside EVENT_REGISTRATION_QUESTIONS', () => {
    expect(() =>
      RegistrationSchema.parse({ ...base, questions: { aspirations: 'peace' } }),
    ).toThrow()
  })

  it('rejects a non-string answer value', () => {
    expect(() => RegistrationSchema.parse({ ...base, questions: { guests: 2 } })).toThrow()
  })
})
