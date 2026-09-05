// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SearchFilters } from './SearchFilters'

import { DEFAULT_FILTERS, type EventFilters } from '@/lib/shape'

/**
 * Clicking the SELECTED option in Format or Frequency clears that filter
 * (issue: the four toggle groups were set-only).
 *
 * **This uses jsdom, since a pure spec genuinely cannot do this job.** The
 * whole assertion is an agreement with a third party. Radix's
 * single-select `ToggleGroup` fires `onValueChange('')` from
 * `onItemDeactivate` when you press the item that is already on. This
 * component's handler maps that empty string onto the `'any'` sentinel. A
 * pure test of the handler could only re-assert the mapping just written,
 * while ASSUMING the signal that reaches it, and the signal is exactly
 * what the old `next && patch(…)` guard got wrong. Driving the real Radix
 * component is the only thing that proves the round trip
 * (`docs/testing.md`, the `routing.router` precedent).
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}))
vi.mock('@/config/api', () => ({
  default: { getGeojson: () => Promise.resolve(undefined) },
  regionsQuery: () => ({ queryKey: ['regions'] }),
}))

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
})

/** Mount the form over `filters` and return the drafts it reports. */
function mount(filters: EventFilters) {
  const drafts: EventFilters[] = []
  const host = document.createElement('div')

  document.body.appendChild(host)

  const root = createRoot(host)

  act(() => {
    root.render(<SearchFilters value={filters} onChange={(next) => drafts.push(next)} />)
  })

  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }

  return { drafts, host }
}

/** The toggle item whose accessible label is `text`, within the group labelled `group`. */
const itemIn = (host: HTMLElement, group: string, text: string) => {
  const root = host.querySelector(`[aria-label="${group}"]`)
  const item = [...(root?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent === text,
  )

  if (!item) throw new Error(`No "${text}" item in the "${group}" group`)

  return item
}

describe('SearchFilters — pressing the selected option clears the filter', () => {
  it('reports format: any when the on option is pressed again', () => {
    const { drafts, host } = mount({ ...DEFAULT_FILTERS, format: 'online' })
    const selected = itemIn(host, 'filters.format.label', 'filters.format.online')

    // Sanity check: Radix really does consider this one on. So the press
    // below is a DESELECT, not just a click on an inert item.
    expect(selected.getAttribute('data-state')).toBe('on')

    act(() => selected.click())

    expect(drafts).toHaveLength(1)
    expect(drafts[0].format).toBe('any')
  })

  it('reports cadence: any when the on option is pressed again', () => {
    const { drafts, host } = mount({ ...DEFAULT_FILTERS, cadence: 'WEEKLY' })
    const selected = itemIn(host, 'filters.cadence.label', 'filters.cadence.weekly')

    expect(selected.getAttribute('data-state')).toBe('on')

    act(() => selected.click())

    expect(drafts).toHaveLength(1)
    expect(drafts[0].cadence).toBe('any')
  })

  // Selecting a DIFFERENT option must still select it. The clearing path
  // must not swallow an ordinary change.
  it('still selects a different option normally', () => {
    const { drafts, host } = mount({ ...DEFAULT_FILTERS, format: 'online' })

    act(() => itemIn(host, 'filters.format.label', 'filters.format.offline').click())

    expect(drafts).toHaveLength(1)
    expect(drafts[0].format).toBe('offline')
  })
})
