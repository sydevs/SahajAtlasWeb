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

  it('keeps the dense 32px items by default and takes the field height on request', () => {
    expect(classesOf(days(), 'Mo')).toContain('h-8')
    expect(classesOf(days({ size: 'md' }), 'Mo')).toContain('field-height')
    expect(classesOf(days({ size: 'md' }), 'Mo')).not.toContain('h-8')
  })

  it('says a required single choice is required, and takes its name from a legend', () => {
    const html = days({ required: true, 'aria-labelledby': 'day-label' })

    expect(html).toContain('aria-required="true"')
    expect(html).toContain('aria-labelledby="day-label"')
  })
})
