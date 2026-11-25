import type { Json } from '@/mocks/sahajcloud'

import { IP_LOCATION_ENDPOINT } from '@/hooks/use-ip-location'
import { mockIpLocation } from '@/mocks/regions'
import { SAHAJCLOUD_API_KEY, sahajCloud } from '@/mocks/sahajcloud'

/**
 * Ladle talks to no API. Every SahajCloud request a story makes is answered from the browser
 * lane's fixtures (`src/mocks/sahajcloud.ts`), over the bigger atlas `sahajcloud-demo.ts` adds, through
 * the app's real fetchers. So the interactive widget can browse, open and register with lists long
 * enough to scroll, and a view's own idle prefetch never reaches production.
 * The IP lookup gets the guess the view stories seed. Mapbox and picsum go out as normal.
 *
 * It patches `fetch` rather than mocking a module, because the app's SDK calls the global one
 * (`interceptFetch`, `config/api/client.ts`), and a patched module would skip the parse.
 */
export function installBackend() {
  const api = new URL(`${import.meta.env.VITE_SAHAJCLOUD_URL}/api/`, window.location.href).href
  const ipLookup = new URL(IP_LOCATION_ENDPOINT).origin
  // The browser's own, kept across reloads of this module, so each install replaces the last
  // rather than wrapping it.
  const network = ((window as { ladleNetwork?: typeof fetch }).ladleNetwork ??=
    window.fetch.bind(window))

  window.fetch = async (input, init) => {
    // Read off the arguments, never through `new Request(input, init)`: that spends a Request's
    // body, and the untouched call below would then refuse it.
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)

    if (url.href.startsWith(api)) {
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      // Loaded on the first read, so a story that never reads pays nothing for the atlas, about
      // 100 ms of building at import. Whatever key a story's client holds, it is the one the
      // fixtures recognise.
      const { answerDemo } = await import('@/mocks/sahajcloud-demo')
      const answer = answerDemo({
        method,
        url,
        authorization: `clients API-Key ${SAHAJCLOUD_API_KEY}`,
      })

      if (!answer) console.warn(`Ladle: no SahajCloud fixture answers ${method} ${url.pathname}`)

      return respond(answer?.status ?? 404, answer?.json ?? sahajCloud.notFound)
    }

    if (url.origin === ipLookup) return respond(200, { success: true, ...mockIpLocation })

    return network(input, init)
  }
}

const respond = (status: number, json: Json) =>
  new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })
