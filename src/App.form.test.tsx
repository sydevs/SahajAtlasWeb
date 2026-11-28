// @vitest-environment jsdom
//
// Which form `App` renders: the inline embed, or the map-first interface. jsdom, because the two
// are lazy chunks behind Suspense, which the SSR renderer would leave as the fallback.
//
// Deliberately no @testing-library/react, like `views/reset-boundary.test.tsx`.
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import atlasAuth from '@/config/api/auth'
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

vi.mock('@/views/FullInterface', () => ({ default: () => <p>map-first</p> }))
vi.mock('@/views/InlineEmbedView/InlineEmbedView', () => ({ default: () => <p>inline</p> }))

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
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
  await act(async () => root?.unmount())
  root = null
  container.remove()
  queryClient.clear()
  atlasAuth.apiKey = null
  getClient.mockReset()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const formFor = async (props: { hasMap?: boolean; inline?: boolean }) => {
  root = createRoot(container)

  await act(async () => {
    root?.render(
      <MemoryRouter>
        <App standalone apiKey="sy-test-key" {...props} />
      </MemoryRouter>,
    )
  })

  return container.querySelector('p')?.textContent
}

describe('the form App renders', () => {
  it('is map-first for the standalone page opened directly', async () => {
    expect(await formFor({})).toBe('map-first')
  })

  it('is inline where the entry asks for it', async () => {
    expect(await formFor({ inline: true })).toBe('inline')
  })

  it('is inline without a map, whatever the entry asked: there is no map to put first', async () => {
    expect(await formFor({ hasMap: false })).toBe('inline')
  })
})
