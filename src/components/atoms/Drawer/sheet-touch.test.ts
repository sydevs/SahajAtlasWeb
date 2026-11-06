// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { claimsSheetDrag } from './sheet-touch'

/** The path a real event would report, from the target up to the document. */
function pathOf(target: Element) {
  const path: EventTarget[] = []

  for (let el: Element | null = target; el; el = el.parentElement) path.push(el)

  return path
}

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

    expect(claimsSheetDrag(pathOf(row), sheet, 0, 5)).toBe(true)
  })

  it('leaves a list that still has content above it to scroll', () => {
    const { sheet, row } = mount(40)

    expect(claimsSheetDrag(pathOf(row), sheet, 0, 5)).toBe(false)
  })

  it('leaves upward and sideways moves alone', () => {
    const { sheet, row } = mount(0)

    expect(claimsSheetDrag(pathOf(row), sheet, 0, -5)).toBe(false)
    expect(claimsSheetDrag(pathOf(row), sheet, 8, 3)).toBe(false)
  })

  it('sees a scrolled list inside a shadow root', () => {
    const { sheet, row } = mount(0)
    const host = document.createElement('mapbox-search-listbox')
    const root = host.attachShadow({ mode: 'open' })
    const list = document.createElement('div')
    const option = document.createElement('div')

    list.style.overflowY = 'auto'
    Object.defineProperty(list, 'scrollHeight', { value: 900 })
    Object.defineProperty(list, 'clientHeight', { value: 300 })
    list.scrollTop = 40
    list.append(option)
    root.append(list)
    row.append(host)

    expect(claimsSheetDrag([option, list, root, host, ...pathOf(row)], sheet, 0, 5)).toBe(false)
  })

  it('leaves text fields and no-drag areas alone', () => {
    const { sheet, row } = mount(0)
    const field = document.createElement('input')
    const slider = document.createElement('div')

    slider.setAttribute('data-vaul-no-drag', '')
    row.append(field)
    row.append(slider)

    expect(claimsSheetDrag(pathOf(field), sheet, 0, 5)).toBe(false)
    expect(claimsSheetDrag(pathOf(slider), sheet, 0, 5)).toBe(false)
  })
})
