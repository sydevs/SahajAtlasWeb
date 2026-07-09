// SahajCloud serves image URLs two ways: absolute in prod (the Cloudflare Images
// CDN, `https://imagedelivery.net/<hash>/<file>/public`) and relative in dev
// (`/api/images/file/<file>`). The relative form 404s against the widget's own
// origin, so resolve it against the SahajCloud origin; an already-absolute URL
// passes through untouched (`new URL` ignores the base when the input is absolute).
//
// Prefix with the origin — not the axios baseURL — because the URL already carries
// `/api/…` and the client baseURL is `${origin}/api`, which would double the `/api`.
export const resolveImageUrl = (
  url: string,
  origin: string = import.meta.env.VITE_SAHAJCLOUD_URL,
): string => new URL(url, origin).href
