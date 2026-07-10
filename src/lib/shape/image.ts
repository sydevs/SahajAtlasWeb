// SahajCloud serves image URLs two ways: absolute in prod (the Cloudflare Images
// CDN, `https://imagedelivery.net/<hash>/<file>/public`) and relative in dev
// (`/api/images/file/<file>`). The relative form 404s against the widget's own
// origin, so resolve it against the SahajCloud origin; an already-absolute URL
// passes through untouched (`new URL` ignores the base when the input is absolute).
//
// Prefix with the origin — not the axios baseURL — because the URL already carries
// `/api/…` and the client baseURL is `${origin}/api`, which would double the `/api`.
//
// Returns null — rather than throwing or passing a raw value through — when the
// url can't be resolved to an http(s) URL: an empty/misconfigured origin (which
// makes `new URL` throw on a relative url), or a non-http(s) scheme
// (`data:`/`javascript:`). That keeps one bad image (or a bad env) from failing
// the whole event read, and stops a hostile CMS image url from smuggling a
// `</script>` payload into the OG/JSON-LD metadata. `getEvent` and the UI already
// skip null urls.
export const resolveImageUrl = (
  url: string,
  origin: string | undefined = import.meta.env.VITE_SAHAJCLOUD_URL,
): string | null => {
  try {
    const resolved = new URL(url, origin)

    return resolved.protocol === 'https:' || resolved.protocol === 'http:' ? resolved.href : null
  } catch {
    return null
  }
}
