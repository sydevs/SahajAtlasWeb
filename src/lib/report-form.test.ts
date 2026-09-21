import type { ReportFormField } from '@/types/report'

import { describe, expect, it } from 'vitest'

import {
  fieldKey,
  renderableFields,
  reportAnswers,
  reportDefaultValues,
  reportSenderEmail,
  reportValuesSchema,
} from './report-form'

import { REPORT_MESSAGE_MAX, REPORT_MESSAGE_MIN } from '@/types/report'

const field = (over: Partial<ReportFormField> & { blockType: string }) =>
  ({ name: 'field', ...over }) as ReportFormField

const prose = { blockType: 'message', message: { root: {} } } as ReportFormField

describe('renderableFields', () => {
  it('drops a block type this build cannot render, and keeps the rest in order', () => {
    const fields = renderableFields({
      id: 1,
      fields: [
        { blockType: 'text', name: 'who' },
        { blockType: 'payment', name: 'fee' },
        { blockType: 'email', name: 'reply' },
      ],
    })

    // An upstream addition must not take down the one path a viewer reaches after something
    // else already failed.
    expect(fields.map((f) => f.blockType)).toEqual(['text', 'email'])
  })

  it('answers an empty list for a form with no fields at all', () => {
    expect(renderableFields({ id: 1, fields: null })).toEqual([])
    expect(renderableFields(undefined)).toEqual([])
  })
})

describe('reportValuesSchema', () => {
  const parse = (fields: ReportFormField[], values: Record<string, string | boolean>) =>
    reportValuesSchema(fields).safeParse(values).success

  it('requires an answer to a required field, and accepts a blank optional one', () => {
    expect(parse([field({ blockType: 'text', required: true })], { f0: '' })).toBe(false)
    expect(parse([field({ blockType: 'text', required: true })], { f0: 'yes' })).toBe(true)
    expect(parse([field({ blockType: 'text' })], { f0: '' })).toBe(true)
  })

  it('accepts the empty string an untouched optional email registers as', () => {
    expect(parse([field({ blockType: 'email' })], { f0: '' })).toBe(true)
    expect(parse([field({ blockType: 'email' })], { f0: 'not-an-email' })).toBe(false)
    expect(parse([field({ blockType: 'email' })], { f0: 'a@b.co' })).toBe(true)
  })

  it('holds the prose bounds on a required textarea, trimming before it measures', () => {
    const textarea = [field({ blockType: 'textarea', required: true })]

    expect(parse(textarea, { f0: 'x'.repeat(REPORT_MESSAGE_MIN - 1) })).toBe(false)
    expect(parse(textarea, { f0: ' '.repeat(REPORT_MESSAGE_MIN + 5) })).toBe(false)
    expect(parse(textarea, { f0: 'x'.repeat(REPORT_MESSAGE_MAX) })).toBe(true)
    expect(parse(textarea, { f0: 'x'.repeat(REPORT_MESSAGE_MAX + 1) })).toBe(false)
  })

  it('refuses an unticked required checkbox, which is a consent, not an answer', () => {
    expect(parse([field({ blockType: 'checkbox', required: true })], { f0: false })).toBe(false)
    expect(parse([field({ blockType: 'checkbox', required: true })], { f0: true })).toBe(true)
    expect(parse([field({ blockType: 'checkbox' })], { f0: false })).toBe(true)
  })

  it('validates nothing for authored prose, which asks no question', () => {
    expect(Object.keys(reportValuesSchema([prose]).shape)).toEqual([])
  })
})

describe('reportDefaultValues', () => {
  it('opens the form on the values the operator authored', () => {
    expect(
      reportDefaultValues([
        field({ blockType: 'select', name: 'urgency', defaultValue: 'today' }),
        field({ blockType: 'checkbox', name: 'consent', defaultValue: true }),
        field({ blockType: 'number', name: 'count', defaultValue: 3 }),
        field({ blockType: 'email', name: 'reply' }),
      ]),
    ).toEqual({ f0: 'today', f1: true, f2: '3', f3: '' })
  })
})

describe('reportAnswers', () => {
  it('re-attaches the authored name a viewer never saw', () => {
    // The form key is the field's POSITION, because an operator-typed name may contain `.` or
    // `[]`, which react-hook-form reads as a path. The CMS matches on the name, so the two have
    // to meet somewhere, and this is where.
    const fields = [field({ blockType: 'text', name: 'user.email' })]

    expect(fieldKey(0)).not.toContain('user.email')
    expect(reportAnswers(fields, { [fieldKey(0)]: 'ada@example.org' })).toEqual({
      'user.email': 'ada@example.org',
    })
  })

  it('keys off the position in the WHOLE field list, prose blocks included', () => {
    // Prose carries no answer but does occupy a position. Counting only the answerable fields
    // would pair every answer after the first prose block with the wrong question.
    const fields = [
      field({ blockType: 'text', name: 'who' }),
      prose,
      field({ blockType: 'text', name: 'what' }),
    ]

    expect(reportAnswers(fields, { f0: 'Ada', f1: 'ignored', f2: 'the address' })).toEqual({
      who: 'Ada',
      what: 'the address',
    })
  })

  it('sends an unticked optional checkbox as `false`, not as a blank', () => {
    // `submissionData` drops a blank value, so a blank would read as a question never asked.
    expect(
      reportAnswers([field({ blockType: 'checkbox', name: 'consent' })], { f0: false }),
    ).toEqual({ consent: 'false' })
  })
})

describe('reportSenderEmail', () => {
  const fields = [
    field({ blockType: 'text', name: 'who' }),
    field({ blockType: 'email', name: 'reply' }),
    field({ blockType: 'email', name: 'second' }),
  ]

  it('takes the first authored email block, trimmed', () => {
    expect(reportSenderEmail(fields, { f0: 'Ada', f1: '  ada@example.org ', f2: 'b@c.de' })).toBe(
      'ada@example.org',
    )
  })

  it('answers nothing when the address is blank, or when the form asks for none', () => {
    expect(reportSenderEmail(fields, { f0: 'Ada', f1: '', f2: '' })).toBeUndefined()
    expect(
      reportSenderEmail([field({ blockType: 'text', name: 'who' })], { f0: 'Ada' }),
    ).toBeUndefined()
  })
})
