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
