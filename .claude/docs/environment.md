# Environment

Vite exposes only **`VITE_`-prefixed** vars to client code via
`import.meta.env.VITE_*`. Anything else is build-time only and must never be a
secret that ends up in the bundle.

## Files

- **`.env`** — committed, non-secret defaults (API endpoint, host).
- **`.env.local`** — gitignored (matched by `*.local` in `.gitignore`). Put
  secrets and machine-specific overrides here. **Never commit it.**

## Variables

| Variable                    | Where        | Purpose |
| --------------------------- | ------------ | ------- |
| `VITE_SAHAJCLOUD_URL`       | `.env`       | SahajCloud origin; the client appends `/api` (`https://cloud.sydevelopers.com`; local backend: `http://localhost:3000`) |
| `VITE_HOST`                 | `.env`       | Origin used to load `public/locales/<lng>/<ns>.json` over HTTP |
| `VITE_MAPBOX_ACCESSTOKEN`   | `.env.local` | Mapbox GL **public** token (`pk.…`) — safe to ship in the bundle |
| `VITE_SAHAJCLOUD_API_KEY`   | `.env.local` | Published `sahaj-atlas-client` API key the widget uses in dev (passed as the `apiKey` prop; sent as `Authorization: clients API-Key …`) |
| `VITE_FATHOM_ID`            | `.env.local` | Fathom analytics site id (optional; analytics disabled if unset / on localhost) |
| `VITE_GOOGLE_PLACES_API_KEY`| `.env.local` | Google Places key (optional, location search) |
| `SAHAJCLOUD_DOCS_PASSWORD`  | `.env.local` | HTTP basic-auth password for the SahajCloud OpenAPI docs; used **only** by the `pnpm types:openapi` script (never `VITE_`-prefixed — tooling-only, never in the bundle) |

## Secrets that must NOT reach the client

- `MAPBOX_SECRET_ACCESSTOKEN` (`sk.…`) — a Mapbox **secret** token (token
  management API). It is **not** `VITE_`-prefixed and must never be referenced in
  client code or committed. The `security-scan` hook blocks staging files that
  contain `sk.`/secret patterns.
- `ACCENT_API_KEY` — used only by the accent-sync GitHub workflows, not the app.

## In the embedded widget

When embedded, the host page supplies the API key (and optional locale) as
element props:

```html
<sahaj-atlas api-key="…" locale="en"></sahaj-atlas>
```

Add `map="false"` to render content-only (no map canvas, no Mapbox token needed).

In dev/standalone, the key comes from `VITE_SAHAJCLOUD_API_KEY`. See `src/Widget.tsx`
and `src/config/api/auth.ts`.

## Rule of thumb

If a value is a secret, it does **not** get a `VITE_` prefix and does **not**
appear anywhere `vite build` can inline it. Public tokens (`pk.` Mapbox) are fine
in the bundle by design.
