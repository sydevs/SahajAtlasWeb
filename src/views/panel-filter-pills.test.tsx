import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { FilterChipsContext, PanelFilterPills } from './shared'

// Node-only SSR (see `docs/testing.md`). i18next echoes the key, and the geocoder modules
// `shared.tsx` pulls in are stood in for at the vendor boundary.
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => null }))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))

const pills = (chips: boolean) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/search?days=2']}>
        <FilterChipsContext.Provider value={chips}>
          <PanelFilterPills inline />
        </FilterChipsContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )

// On a computer the chips over the map show every active filter, so the panel's own tags said the
// same thing twice ('TUE ×' in the panel, a filled 'Tue' chip and Clear over the map).
describe('PanelFilterPills', () => {
  it('tags the active filters where the filters sit behind a button', () => {
    expect(pills(false)).toContain('filters.chrome.remove')
  })

  it('leaves them to the chips where the chips show', () => {
    expect(pills(true)).toBe('')
  })
})
