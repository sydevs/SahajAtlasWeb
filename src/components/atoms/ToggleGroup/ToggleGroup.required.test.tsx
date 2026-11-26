// @vitest-environment jsdom
import { act, useState } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ToggleGroup, ToggleGroupItem } from './ToggleGroup'

// Radix clears a single-choice group when its chosen item is pressed again. A required
// question must keep its answer, as a radio group does — a re-render SSR cannot show.

let host: HTMLElement
let root: Root

function Days({ required }: { required?: boolean }) {
  const [value, setValue] = useState('tu')

  return (
    <>
      <ToggleGroup required={required} type="single" value={value} onValueChange={setValue}>
        <ToggleGroupItem value="mo">Mo</ToggleGroupItem>
        <ToggleGroupItem value="tu">Tu</ToggleGroupItem>
      </ToggleGroup>
      <output>{value}</output>
    </>
  )
}

const item = (label: string) => {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent === label)

  if (!found) throw new Error(`no item labelled ${label}`)

  return found
}

const press = (label: string) => act(() => item(label).click())

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('a required single choice', () => {
  it('keeps its answer when the chosen item is pressed again', () => {
    act(() => root.render(<Days required />))
    press('Tu')
    expect(host.querySelector('output')?.textContent).toBe('tu')
    press('Mo')
    expect(host.querySelector('output')?.textContent).toBe('mo')
  })

  it('keeps it uncontrolled too', () => {
    act(() =>
      root.render(
        <ToggleGroup required defaultValue="tu" type="single">
          <ToggleGroupItem value="mo">Mo</ToggleGroupItem>
          <ToggleGroupItem value="tu">Tu</ToggleGroupItem>
        </ToggleGroup>,
      ),
    )
    press('Tu')
    expect(item('Tu').dataset.state).toBe('on')
  })

  it('clears, as Radix does, when the question is optional', () => {
    act(() => root.render(<Days />))
    press('Tu')
    expect(host.querySelector('output')?.textContent).toBe('')
  })
})
