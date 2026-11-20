/**
 * The media types the two local static servers serve — `serve-embed-review.mjs`, which stands
 * the built widget up as a host page would, and `check-a11y.mjs`, which stands the component
 * library up for the accessibility gate.
 *
 * Shared because it is a table that gets edited again — a font format, an image format — and a
 * second copy is one that gets edited once. Neither server guesses: a type absent here is
 * served as `application/octet-stream`, which a browser refuses to execute or style, so a
 * missing row fails loudly rather than silently.
 *
 * The underscore marks this a helper rather than a runnable script, as `_ci-output.mjs` does.
 */
export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}
