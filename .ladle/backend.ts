import type { Json } from '@/mocks/sahajcloud'

import { useApproxLocation } from '@/config/store'
import { SAHAJCLOUD_API_KEY, answerSahajCloud, sahajCloud } from '@/mocks/sahajcloud'

/**
 * Ladle talks to no API. Every SahajCloud request a story makes is answered from the browser
 * lane's fixtures (`src/mocks/sahajcloud.ts`), over the bigger atlas `sahajcloud-demo.ts` adds, through
 * the app's real fetchers. So the interactive widget can browse, open and register with lists long
 * enough to scroll, and a view's own idle prefetch never reaches production.
 * The approximate location stands in for the app Worker's `/geo.js`. Mapbox and picsum go out as normal.
 *
 * It patches `fetch` rather than mocking a module, because the app's SDK calls the global one
 * (`interceptFetch`, `config/api/client.ts`), and a patched module would skip the parse.
 */
export function installBackend() {
  // Prague, in a country far down the demo atlas's list, so the first screen visibly lifts it to
  // the top.
  useApproxLocation.setState({
    location: { countryCode: 'CZ', place: { city: 'Prague', center: [14.4378, 50.0755] } },
  })
  const api = new URL(`${import.meta.env.VITE_SAHAJCLOUD_URL}/api/`, window.location.href).href
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
      const { demo } = await import('@/mocks/sahajcloud-demo')
      const answer = answerSahajCloud(
        { method, url, authorization: `clients API-Key ${SAHAJCLOUD_API_KEY}` },
        demo,
      )

      if (!answer) console.warn(`Ladle: no SahajCloud fixture answers ${method} ${url.pathname}`)

      return respond(answer?.status ?? 404, answer?.json ?? sahajCloud.notFound)
    }

    return network(input, init)
  }
}

const respond = (status: number, json: Json) =>
  new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })
