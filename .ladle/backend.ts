import type { Json } from '@/mocks/wire'

import { mockEventImages } from '@/mocks/events'
import { answerSahajCloud, wire, WIRE_API_KEY } from '@/mocks/wire'

/**
 * Ladle talks to no API. Every SahajCloud request a story makes is answered from the browser
 * lane's wire fixtures (`src/mocks/wire.ts`), through the app's real fetchers, so the interactive
 * widget can browse, open and register, and a view's own idle prefetch never reaches production.
 * The IP lookup gets the guess the view stories seed. Mapbox and picsum go out as normal.
 *
 * It patches `fetch` rather than mocking a module, because the app's SDK calls the global one
 * (`interceptFetch`, `config/api/client.ts`), and a patched module would skip the parse.
 */
export function installBackend() {
  // Resolved against the page, as the SDK's own base is, so an unset origin still matches.
  const apiBase = new URL(`${import.meta.env.VITE_SAHAJCLOUD_URL}/api/`, window.location.href)
  const network = window.fetch.bind(window)

  window.fetch = async (input, init) => {
    const request = new Request(input, init)

    if (request.url.startsWith(apiBase.href)) {
      const url = new URL(`/api/${request.url.slice(apiBase.href.length)}`, 'https://wire.invalid')
      const answer = answerSahajCloud({
        method: request.method,
        url,
        // Whatever key a story's client holds, it is the one the fixtures recognise.
        authorization: `clients API-Key ${WIRE_API_KEY}`,
      })

      if (!answer) console.warn(`Ladle: no wire fixture answers ${request.method} ${url.pathname}`)

      return respond(answer?.status ?? 404, withStoryImages(answer?.json ?? wire.notFound))
    }

    if (new URL(request.url).origin === IP_LOOKUP) return respond(200, IP_GUESS)

    return network(input, init)
  }
}

const IP_LOOKUP = 'https://ipwho.is'

/** Cambridge, the guess `story-harness.tsx` seeds, as ipwho.is sends it. */
const IP_GUESS = {
  success: true,
  latitude: 52.2,
  longitude: 0.12,
  city: 'Cambridge',
  country: 'United Kingdom',
  country_code: 'GB',
}

const respond = (status: number, json: Json) =>
  new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * The wire's images are relative, as SahajCloud serves a file it holds, so an `<img>` would ask
 * production for a file it does not have. A story shows the mocks' own pictures instead.
 */
function withStoryImages(json: Json): Json {
  if (!json || typeof json !== 'object' || Array.isArray(json) || !Array.isArray(json.images)) {
    return json
  }

  return {
    ...json,
    images: json.images.map((image, index) =>
      image && typeof image === 'object' && !Array.isArray(image)
        ? { ...image, url: mockEventImages[index % mockEventImages.length].url }
        : image,
    ),
  }
}
