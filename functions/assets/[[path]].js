// Cloudflare Pages Function scoped to /assets/* (file-based routing).
//
// Without it, a request for a hashed chunk from a superseded deployment falls
// through to the `public/_redirects` SPA catch-all and returns index.html with
// 200 + text/html — the browser rejects the module with a strict-MIME error,
// and the zone cache can pin that HTML under the .js URL for hours. A missing
// asset must be a real 404 so a failed chunk load surfaces as a fetch error
// (triggering the vite:preloadError reload in src/config/chunk-recovery.ts)
// and nothing cacheable is emitted for it.
export async function onRequest({ request, env }) {
  const response = await env.ASSETS.fetch(request)

  // The build only emits js/css/fonts/images under /assets — an HTML response
  // here can only be the SPA fallback standing in for a file that's gone.
  if (!(response.headers.get('content-type') || '').includes('text/html')) {
    return response
  }

  return new Response('Not Found', {
    status: 404,
    headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
  })
}
