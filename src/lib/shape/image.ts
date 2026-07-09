// SahajCloud serves image URLs two ways: absolute in prod (the Cloudflare Images
// CDN, `https://imagedelivery.net/<hash>/<file>/public`) and relative in dev
// (`/api/images/file/<file>`). The relative form 404s against the widget's own
// origin, so resolve it against the SahajCloud origin; an already-absolute URL
// passes through untouched (`new URL` ignores the base when the input is absolute).
//
// Prefix with the origin — not the axios baseURL — because the URL already carries
// `/api/…` and the client baseURL is `${origin}/api`, which would double the `/api`.
//
// Best-effort: if `origin` is empty/misconfigured, `new URL` throws on a relative
// url — fall back to the raw url so a bad env degrades to a broken <img> rather
// than failing the whole event read (this runs inside `getEvent`'s image map).
export const resolveImageUrl = (
  url: string,
  origin: string | undefined = import.meta.env.VITE_SAHAJCLOUD_URL,
): string => {
  try {
    return new URL(url, origin).href
  } catch {
    return url
  }
}
