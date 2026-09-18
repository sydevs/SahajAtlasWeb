import { API_BASE_URL, interceptFetch } from '@/config/api/client'

/**
 * The populate transport every preview arm sits on (issue #40).
 *
 * `useLivePreview` gives an arm one seam — the request handler it calls per accepted message —
 * and that seam is both the document filter and the network boundary. It lives here rather than
 * beside any one arm because the filter below is what keeps two arms from ever rendering each
 * other's document.
 */

// The CMS admin posts live edits from the SahajCloud origin, and `isLivePreviewEvent` compares
// `event.origin` against this exact string. (A trailing path or slash on the env value is
// tolerated via `.origin`.)
export const SERVER_ORIGIN = new URL(import.meta.env.VITE_SAHAJCLOUD_URL).origin

/** What `mergeData` hands the request handler, narrowed to the two fields an arm reads. */
export type PopulateRequest = { data: Record<string, unknown>; endpoint: string }

export const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

/**
 * Whether the populate endpoint the library composed names the document on screen.
 *
 * ⚠ **This is the whole document filter.** `useLivePreview` takes no collection, no id and no
 * predicate: it merges any message carrying a slug, and builds `endpoint` as
 * `<the message's collectionSlug>/<our initialData.id>` — so the collection half is whatever
 * the panel happens to be editing while the id half is ours. A missed check populates one
 * document's unsaved edits into the page showing another.
 *
 * An absent id refuses everything, which is what a region wants before its own read has
 * landed: the endpoint would otherwise address `regions/undefined`.
 */
export function namesPreviewedDoc(
  endpoint: string,
  collection: string,
  // A submission's id arrives as the `?id=` string off the boot URL, an event's as a number
  // off the cache. The endpoint is a string either way.
  id?: number | string,
): boolean {
  return id !== undefined && id !== '' && endpoint === `${collection}/${id}`
}

/**
 * The populate handler `useLivePreview` calls for each accepted message. It pushes the admin's
 * unsaved form state through Payload's populate endpoint — a GET behind a method override — so
 * relations and computed fields like `upcomingDates` resolve server-side, without saving.
 *
 * It goes through `interceptFetch`, so the API key, the live-preview token header and
 * `draft=true` attach in the one place every other SahajCloud request gets them. Payload's own
 * default handler is what this replaces: it sends `credentials: 'include'` for an admin cookie,
 * which a cross-origin widget has none of.
 *
 * ⚠ **It must never reject, and must always resolve JSON.** `mergeData` is
 * `requestHandler(…).then((res) => res.json())` with no catch and no status check, so a
 * rejection silently takes the subscription's callback with it, and an `{errors:[…]}` body
 * becomes the document the library caches and merges the next edit onto. Every refusal
 * therefore answers with the seed: `{ id }` alone fails the schema parse at the call site, so
 * the last good document stays on screen while the next message still populates under the
 * right id.
 */
export function populateHandler(collection: 'events' | 'regions', id?: number) {
  const seed = () => jsonResponse({ id })

  return async ({ data, endpoint }: PopulateRequest): Promise<Response> => {
    if (!namesPreviewedDoc(endpoint, collection, id)) return seed()

    try {
      const response = await interceptFetch(`${API_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payload-HTTP-Method-Override': 'GET',
        },
        body: JSON.stringify(data),
      })

      return response.ok ? response : seed()
    } catch {
      return seed()
    }
  }
}
