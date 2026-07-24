// Cloudflare Pages Function scoped to /assets/* (file-based routing).
//
// Without it, a request for a hashed chunk from a superseded deployment falls
// through to the `public/_redirects` SPA catch-all and returns index.html with
// 200 + text/html — the browser rejects the module with a strict-MIME error,
// and the zone cache can pin that HTML under the .js URL for hours. A missing
// asset must be a real 404 so a failed chunk load surfaces as a fetch error
// (triggering the vite:preloadError reload in src/config/chunk-recovery.ts)
// and nothing cacheable is emitted for it.
//
// Runs on every /assets/* request — Pages can't scope a Function to misses
// only — trading a per-request invocation for correct 404s. Accepted at this
// project's traffic; if quota/latency ever matter, the Workers static-assets
// model (`not_found_handling`) 404s natively without the hop.

/**
 * @param {{ request: Request, env: { ASSETS: { fetch: typeof fetch } } }} context
 */
export async function onRequest({ request, env }) {
  const response = await env.ASSETS.fetch(request)

  if (isSpaFallback(response)) return notFound()

  // A 304 revalidation carries no content-type to sniff, so a browser that
  // cached the fallback HTML under a chunk URL (the pre-Function incident)
  // would keep revalidating that entry forever — sniff via an unconditional
  // GET and heal it to a 404 too. Real assets keep their 304s.
  if (response.status === 304 && isSpaFallback(await env.ASSETS.fetch(new Request(request.url)))) {
    return notFound()
  }

  return response
}

// The build emits no HTML under /assets, and the `_redirects` catch-all always
// answers 200 — so 200 + text/html can only be the fallback standing in for a
// missing file. Every other status passes through: a transient 5xx must stay
// retryable, not become a definitive 404.
function isSpaFallback(response) {
  return (
    response.status === 200 && (response.headers.get('content-type') || '').includes('text/html')
  )
}

function notFound() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
  })
}
