// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { claimsSheetDrag } from './sheet-touch'

function mount(scrollTop: number) {
  const sheet = document.createElement('div')
  const list = document.createElement('div')
  const row = document.createElement('button')

  list.style.overflowY = 'auto'
  Object.defineProperty(list, 'scrollHeight', { value: 900 })
  Object.defineProperty(list, 'clientHeight', { value: 300 })
  list.scrollTop = scrollTop
  list.append(row)
  sheet.append(list)
  document.body.append(sheet)

  return { sheet, row }
}

describe('claimsSheetDrag', () => {
  it('claims a downward move on a list at its top', () => {
    const { sheet, row } = mount(0)

    expect(claimsSheetDrag(row, sheet, 0, 5)).toBe(true)
  })

  it('leaves a list that still has content above it to scroll', () => {
    const { sheet, row } = mount(40)

    expect(claimsSheetDrag(row, sheet, 0, 5)).toBe(false)
  })

  it('leaves upward and sideways moves alone', () => {
    const { sheet, row } = mount(0)

    expect(claimsSheetDrag(row, sheet, 0, -5)).toBe(false)
    expect(claimsSheetDrag(row, sheet, 8, 3)).toBe(false)
  })

  it('leaves text fields and no-drag areas alone', () => {
    const { sheet, row } = mount(0)
    const field = document.createElement('input')
    const slider = document.createElement('div')

    slider.setAttribute('data-vaul-no-drag', '')
    row.append(field)
    row.append(slider)

    expect(claimsSheetDrag(field, sheet, 0, 5)).toBe(false)
    expect(claimsSheetDrag(slider, sheet, 0, 5)).toBe(false)
  })
})
