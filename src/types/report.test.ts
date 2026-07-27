import { describe, expect, it } from 'vitest'

import { REPORT_MESSAGE_MAX, REPORT_MESSAGE_MIN, ReportSchema } from './report'

const message = 'x'.repeat(REPORT_MESSAGE_MIN)

describe('ReportSchema', () => {
  it('accepts a message with no email — a report is useful without a reply address', () => {
    expect(ReportSchema.safeParse({ message }).success).toBe(true)
  })

  it('accepts the empty string an untouched email input registers as', () => {
    expect(ReportSchema.safeParse({ email: '', message }).success).toBe(true)
  })

  it('accepts a valid email and rejects a malformed one', () => {
    expect(ReportSchema.safeParse({ email: 'a@b.co', message }).success).toBe(true)
    expect(ReportSchema.safeParse({ email: 'not-an-email', message }).success).toBe(false)
  })

  it('holds the message length bounds', () => {
    expect(ReportSchema.safeParse({ message: 'x'.repeat(REPORT_MESSAGE_MIN - 1) }).success).toBe(
      false,
    )
    expect(ReportSchema.safeParse({ message: 'x'.repeat(REPORT_MESSAGE_MAX) }).success).toBe(true)
    expect(ReportSchema.safeParse({ message: 'x'.repeat(REPORT_MESSAGE_MAX + 1) }).success).toBe(
      false,
    )
  })

  it('trims before measuring, so whitespace alone cannot satisfy the minimum', () => {
    expect(ReportSchema.safeParse({ message: ' '.repeat(REPORT_MESSAGE_MIN + 5) }).success).toBe(
      false,
    )
    expect(ReportSchema.parse({ message: `  ${message}  ` }).message).toBe(message)
  })

  it('requires a message', () => {
    expect(ReportSchema.safeParse({ email: 'a@b.co' }).success).toBe(false)
  })
})
