/**
 * Returns `url` only if it is an http(s) absolute URL, else `undefined`. Guards a
 * server-provided `webUrl` before it reaches a `<link rel="canonical">` / `og:url`
 * href — the same http(s)-only safety `SafeUrlSchema` enforces for event URLs,
 * for the plain-string region/client `webUrl`s that aren't zod-guarded.
 */
export const validateWebUrl = (url: string | null | undefined): string | undefined =>
  url && /^https?:/i.test(url) ? url : undefined
