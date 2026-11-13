import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'

/** The classes of the item labelled `label` (Radix renders no value attribute). */
const classesOf = (html: string, label: string) =>
  (html.match(new RegExp(`<button[^>]*class="([^"]*)"[^>]*>${label}</button>`))?.[1] ?? '')
    .split(' ')
    .filter(Boolean)

const days = (props: { size?: 'sm' | 'md'; required?: boolean; 'aria-labelledby'?: string } = {}) =>
  renderToStaticMarkup(
    <ToggleGroup type="single" value="tu" {...props}>
      <ToggleGroupItem value="mo">Mo</ToggleGroupItem>
      <ToggleGroupItem value="tu">Tu</ToggleGroupItem>
    </ToggleGroup>,
  )

describe('ToggleGroup', () => {
  it('is a radio group for a single choice, with the chosen item checked', () => {
    const html = days()

    expect(html).toContain('role="radiogroup"')
    expect(html).toMatch(/<button[^>]*role="radio"[^>]*aria-checked="true"[^>]*>Tu<\/button>/)
  })

  it('keeps the dense 32px items by default and takes a field’s height on request', () => {
    expect(classesOf(days(), 'Mo')).toContain('h-8')
    expect(classesOf(days({ size: 'md' }), 'Mo')).toContain('field-height')
    expect(classesOf(days({ size: 'md' }), 'Mo')).not.toContain('h-8')
  })

  it('says a required single choice is required, and takes its name from a legend', () => {
    const html = days({ required: true, 'aria-labelledby': 'day-label' })

    expect(html).toContain('aria-required="true"')
    expect(html).toContain('aria-labelledby="day-label"')
  })

  // ARIA gives the multiple-choice root (a toolbar) neither attribute; the field's legend and its
  // described-by error say required and invalid there.
  it('keeps aria-required and aria-invalid off a multiple choice’s root', () => {
    const html = renderToStaticMarkup(
      <ToggleGroup isInvalid aria-describedby="days-error" aria-required="true" type="multiple">
        <ToggleGroupItem value="mo">Mo</ToggleGroupItem>
      </ToggleGroup>,
    )

    expect(html).not.toContain('aria-required')
    expect(html).not.toContain('aria-invalid')
    expect(html).toContain('aria-describedby="days-error"')
  })

  it('says a single choice is invalid on its radiogroup', () => {
    const html = renderToStaticMarkup(
      <ToggleGroup isInvalid type="single">
        <ToggleGroupItem value="mo">Mo</ToggleGroupItem>
      </ToggleGroup>,
    )

    expect(html).toMatch(
      /role="radiogroup"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*role="radiogroup"/,
    )
  })
})
