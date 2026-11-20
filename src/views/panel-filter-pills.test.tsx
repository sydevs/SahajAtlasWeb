import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { FilterPanelContext, PanelFilterPills } from './shared'

// Node-only SSR (see `docs/testing.md`). i18next echoes the key, and the geocoder modules
// `shared.tsx` pulls in are stood in for at the vendor boundary.
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => null }))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))

const pills = (panel: 'open' | 'closed' | null) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/search?days=2']}>
        <FilterPanelContext.Provider value={panel}>
          <PanelFilterPills inline />
        </FilterPanelContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )

// On a computer the open filters panel shows every active filter, so the list's own tags said the
// same thing twice ('TUE ×' in the list toolbar, a selected Tue in the panel beside it).
describe('PanelFilterPills', () => {
  it('tags the active filters where the filters sit behind a button', () => {
    expect(pills(null)).toContain('filters.chrome.remove')
  })

  it('tags them while the panel is closed', () => {
    expect(pills('closed')).toContain('filters.chrome.remove')
  })

  it('leaves them to the panel while the panel is on screen', () => {
    expect(pills('open')).toBe('')
  })
})
