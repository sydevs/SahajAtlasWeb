import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { SearchFilters } from './SearchFilters'

import { DEFAULT_FILTERS } from '@/lib/shape'

// Node-only SSR assertions (see `CLAUDE.md § Testing`). The form is fully controlled and
// store-free, so the only things it reaches for are copy, the locale, and the two cached
// reads it derives its option lists from — all mocked at the boundary.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageLabel: (code: string) => code }),
}))
// Partial: `config/query-client` constructs a real QueryClient on import, so only the
// hook is replaced. With no feed cached the form still renders every group — the geojson
// read only supplies the Language dropdown's options.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}))
// Mocked so the import chain never reaches `config/i18n`, which boots i18next on import.
vi.mock('@/config/api', () => ({
  default: { getGeojson: () => Promise.resolve(undefined) },
  regionsQuery: () => ({ queryKey: ['regions'] }),
}))

const render = (filters = DEFAULT_FILTERS) =>
  renderToStaticMarkup(<SearchFilters value={filters} onChange={() => {}} />)

// Every group's "Clear" link is HIDDEN rather than unmounted, so appearing and disappearing
// cannot change its row's height.
//
// The row is `items-baseline` and the two children have different line boxes — the label is
// `text-sm` (19.5px), Clear is `text-xs` (~20px) — so mounting the button on selection grew
// the row and pushed every section below it down the page. Reserving the space is what makes
// that impossible; tuning the line-height only made the two numbers closer.
//
// The invariant is the COUNT, not the class: as long as the same number of buttons occupy
// the flex layout in both states, no amount of later restyling can reintroduce the jump.
describe('SearchFilters — the per-group Clear reserves its space', () => {
  const clearButtons = (html: string) =>
    html.match(/<button[^>]*>filters\.clear_one<\/button>/g) ?? []

  it('renders the same number of Clear buttons with nothing selected as with a selection', () => {
    const idle = clearButtons(render())
    const active = clearButtons(render({ ...DEFAULT_FILTERS, format: 'online', daysOfWeek: [1] }))

    expect(idle.length).toBeGreaterThan(0)
    expect(idle).toHaveLength(active.length)
  })

  it('hides every Clear while its group is untouched', () => {
    const buttons = clearButtons(render())

    // Asserted before the `every`, which is vacuously true on an empty list — and an empty
    // list is exactly what the unmounting bug produces, so without this the spec would pass
    // against the defect it exists to catch.
    expect(buttons.length).toBeGreaterThan(0)
    // `visibility: hidden` keeps the button in flow while taking it out of the tab order and
    // the accessibility tree, so a hidden control is never reachable.
    expect(buttons.every((button) => button.includes('invisible'))).toBe(true)
  })

  it('reveals only the Clear of a group that has a selection', () => {
    const buttons = clearButtons(render({ ...DEFAULT_FILTERS, format: 'online' }))
    const shown = buttons.filter((button) => !button.includes('invisible'))

    expect(shown).toHaveLength(1)
    // The others are still there, hidden — same reason as above.
    expect(buttons.length).toBeGreaterThan(shown.length)
  })
})
