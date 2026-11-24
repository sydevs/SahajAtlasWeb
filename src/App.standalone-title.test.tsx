// @vitest-environment jsdom
//
// The standalone document's tab title on a view that sets none of its own (a region, the
// calendar, search). jsdom, because the property is what React leaves in `<head>` across a
// commit that unmounts a view: on React 19, react-helmet-async renders `<title>` as an element
// React hoists, and removes it with the view, so the document falls back to `index.html`'s
// static English placeholder unless something still mounted names one.
//
// Deliberately no @testing-library/react, like `views/reset-boundary.test.tsx`.
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import atlasAuth from '@/config/api/auth'
import i18n from '@/config/i18n'
import { queryClient } from '@/config/query-client'

const getClient = vi.hoisted(() => vi.fn())

vi.mock('@/config/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/api')>()),
  clientQuery: (apiKey?: string | null) => ({
    queryKey: ['client', apiKey] as const,
    queryFn: getClient,
  }),
}))

vi.mock('@/hooks/use-report-form', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-report-form')>()),
  useReportForm: () => ({ formId: null, enabled: false }),
}))

// The drawer stack is not the subject: only whether the view on top sets a title. The stand-in
// starts as CountriesView does, titled, and a press swaps it for a view with none.
vi.mock('@/views/FullInterface', async () => {
  const { useState } = await import('react')
  const { Helmet } = await import('react-helmet-async')

  return {
    default: function ViewStandIn() {
      const [titled, setTitled] = useState(true)

      return (
        <>
          {titled && (
            <Helmet>
              <title>A view of its own</title>
            </Helmet>
          )}
          <button type="button" onClick={() => setTitled(false)}>
            open a region
          </button>
        </>
      )
    },
  }
})

// `index.html` ships this before React runs. It stays in the document for good.
const PLACEHOLDER = 'Meditation classes'

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  document.head.innerHTML = `<title>${PLACEHOLDER}</title>`
  container = document.createElement('div')
  document.body.append(container)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in this lane'))),
  )
  getClient.mockResolvedValue({ id: 1, allowedDomains: '', region: null })
  atlasAuth.apiKey = 'sy-test-key'
})

afterEach(async () => {
  // Before the head is cleared: a tree left mounted by a failing case would otherwise try to
  // remove a hoisted `<title>` that is no longer in the document.
  await act(async () => root?.unmount())
  root = null
  container.remove()
  document.head.innerHTML = ''
  queryClient.clear()
  atlasAuth.apiKey = null
  getClient.mockReset()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const mount = async () => {
  root = createRoot(container)

  await act(async () => {
    root?.render(
      <MemoryRouter>
        <App standalone apiKey="sy-test-key" />
      </MemoryRouter>,
    )
  })
}

describe('the standalone tab title', () => {
  it("is the view's own while one is set", async () => {
    await mount()

    expect(document.title).toBe('A view of its own')
  })

  it('stays localized on a view that sets none, not the static placeholder', async () => {
    await mount()
    const open = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'open a region',
    )

    expect(open).toBeTruthy()

    await act(async () => {
      open?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.title).toBe(i18n.t('countries.title'))
    expect(document.title).not.toBe(PLACEHOLDER)
  })
})
