// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IpLookupContext, useIpLocation } from './use-ip-location'

// Whether a lookup runs is the query actually firing, which only a mounted observer does —
// SSR builds the query and never fetches, so it could not tell the two cases apart.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Probe() {
  useIpLocation(true)

  return null
}

const mount = async (allowed?: boolean) => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })

  vi.stubGlobal('fetch', fetch)

  const root = createRoot(document.createElement('div'))
  const probe = <Probe />

  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        {allowed === undefined ? (
          probe
        ) : (
          <IpLookupContext.Provider value={allowed}>{probe}</IpLookupContext.Provider>
        )}
      </QueryClientProvider>,
    ),
  )
  act(() => root.unmount())

  return fetch
}

describe('IpLookupContext', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lets a caller that asks for the lookup run it by default', async () => {
    expect(await mount()).toHaveBeenCalledOnce()
  })

  it('keeps every lookup under a `false` provider from running', async () => {
    expect(await mount(false)).not.toHaveBeenCalled()
  })
})
