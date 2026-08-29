# Environment

Vite exposes only **`VITE_`-prefixed** vars to client code via
`import.meta.env.VITE_*`. Anything else is build-time only and must never be a
secret that ends up in the bundle.

## Files

- **`.env`** — committed, non-secret defaults (API endpoint, host).
- **`.env.local`** — gitignored (matched by `*.local` in `.gitignore`). Put
  secrets and machine-specific overrides here. **Never commit it.**

## Variables

| Variable                   | Where                         | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SAHAJCLOUD_URL`      | `.env`                        | SahajCloud origin; the client appends `/api` (`https://cloud.sydevelopers.com`; local backend: `http://localhost:3000`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `VITE_HOST`                | `.env`                        | Origin used to load `public/locales/<lng>/<ns>.json` over HTTP. Absolute by necessity: embedded, the widget runs on the host's page while its translations live wherever the bundle came from, so a relative path would resolve against the host's origin. **On Cloudflare it falls back to `CF_PAGES_URL`** (the current deployment's own URL) when nothing explicit is set — `vite.config.ts`, and the reason is that a preview cannot use a static value, each deployment having its own host. Production sets this in the dashboard, so the fallback never fires there and hosts still fetch from `sahajatlas.com` as `docs/embedding.md` promises. ⚠ **Getting this wrong does not degrade, it blanks**: shipping the `localhost:5174` default to a `pages.dev` origin makes every locale fetch a blocked private-network request, i18next's `init` never resolves, and every component reading a translation suspends forever — which is exactly what every preview deploy did until it was fixed |
| `VITE_TURNSTILE_SITE_KEY`  | `.env`                        | Cloudflare Turnstile **site** key for the report-issue form — public by design (the secret half lives in SahajCloud), so it's committed. `.env` holds Cloudflare's always-passes test key `1x00000000000000000000AA` for dev/Ladle/CI; production overrides it in the Cloudflare Pages environment. Unset ⇒ the form degrades to the `mailto:` fallback. **Since #103 this key is load-bearing, not decorative**: the form now delivers a real email through SahajCloud's captcha-gated endpoint, so the test key in production means the captcha in front of a mail sender is a no-op — and a site key that doesn't pair with SahajCloud's `TURNSTILE_SECRET_KEY` makes every report 403 as `captcha_failed`, visible only as a sentence in the viewer's face                                                                                                                                                                                                                                           |
| `VITE_SENTRY_DSN`          | Cloudflare                    | Sentry ingest DSN for automatic error reporting (issue #108). Must be the **modern public-key form** `https://<key>@<host>/<project>` — the legacy `https://<key>:<secret>@…` spelling would put a real secret in the public bundle. Public by design otherwise (a DSN is write-only), but deliberately NOT committed to `.env`: one in the repo means every fork, preview and developer's `pnpm dev` posts into the production project. Set it per-environment in the Cloudflare Pages dashboard, and add that DSN's host to the integrator CSP guidance in `README.md` — note the ingest host is regional (`o…​.ingest.us.sentry.io`) for orgs created since 2024. **Unset ⇒ `reportInternalError` logs to the console and nothing else; the SDK chunk is never fetched.** Hosts can decline it per-embed with `error-reporting="false"`                                                                                                                                                               |
| `SENTRY_AUTH_TOKEN`        | Cloudflare                    | **Build-time only, and a real secret** (issue #130). Deliberately not `VITE_`-prefixed, so Vite cannot inline it; **`pnpm assert:maps` additionally greps every emitted file for its value** and fails the build if it appears, so that is a gate rather than a habit. Its presence is what switches source-map upload on: set ⇒ `build.sourcemap: 'hidden'`, `@sentry/vite-plugin` uploads the maps and deletes them; unset ⇒ **no maps are emitted at all** and the build is byte-identical to one from before #130. See step 2 of the runbook for the scopes it needs — the plugin never creates, finalizes or sets commits on a release, but the upload call is still release-scoped                                                                                                                                                                                                                                                                                                                 |
| `SENTRY_ORG`               | Cloudflare                    | Sentry organisation slug. Build-time only. Required **whenever `SENTRY_AUTH_TOKEN` is set** — a half-configured build fails loudly rather than deploying green with every frame still minified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `SENTRY_PROJECT`           | Cloudflare                    | Sentry project slug. Build-time only; same requirement as `SENTRY_ORG`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `VITE_MAPBOX_ACCESSTOKEN`  | `.env.local`                  | Mapbox GL **public** token (`pk.…`) — safe to ship in the bundle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `VITE_SAHAJCLOUD_API_KEY`  | `.env.local` **+ Cloudflare** | Published `sahaj-atlas-client` API key (sent as `Authorization: clients API-Key …`). **Not dev-only, which this row used to imply.** The standalone build falls back to it when the URL carries no `?key=` (`main.tsx`: `searchParams.get('key') \|\| import.meta.env.VITE_SAHAJCLOUD_API_KEY`), which is the whole reason `sahajatlas.com` renders keyless — Pages has it set in the **Production** environment. ⚠ **Set it in the Preview environment too.** Without it every preview deploy answers `Missing api key` and renders the configuration-error screen, so a reviewer has to append `?key=…` by hand to every link. Unlike `VITE_HOST` beside it this cannot be defaulted in `vite.config.ts` — there is no Cloudflare-provided value to reach for, and the key must stay out of the committed `.env`, or every fork and every `pnpm dev` would carry it                                                                                                                                   |
| `VITE_WEMEDITATE_MAP_URL`  | `.env`                        | Where a **framed** embed sends a visitor when its frame is too small for the interface (#161). A frame cannot expand — `position: fixed` resolves against the frame — so the compact card's button is an anchor opened in a new tab. Public by design. It is a **default, not a decision**: per-region canonical ownership (SahajCloud #634) will make the right destination the owner's own site, and this stands in until a client record can answer. Invalid or non-`https:` values fall back to the literal default rather than reaching the anchor, because the `Button` atom refuses an unsafe href by rendering an unlabelled `<span>` — on a card whose only content is that control, a typo would ship an embed with no way out. ⚠ **The link carries no route today**: `wemeditate.com/map` serves the legacy hash-routing build until the origin cutover (#148 Part 2), so an appended `?atlas=` is silently dropped                                                                         |
| `VITE_FATHOM_ID`           | `.env.local`                  | Fathom analytics site id (optional; analytics disabled if unset / on localhost)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `SAHAJCLOUD_DOCS_PASSWORD` | `.env.local`                  | HTTP basic-auth password for the SahajCloud OpenAPI docs; used **only** by the `pnpm types:openapi` script (never `VITE_`-prefixed — tooling-only, never in the bundle)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Secrets that must NOT reach the client

- `MAPBOX_SECRET_ACCESSTOKEN` (`sk.…`) — a Mapbox **secret** token (token
  management API). It is **not** `VITE_`-prefixed and must never be referenced in
  client code or committed. The `security-scan` hook blocks staging files that
  contain `sk.`/secret patterns.

- `SENTRY_AUTH_TOKEN` — see the table above. Build-time only and never
  `VITE_`-prefixed. Note it is the **only** secret in this repo that is read by a
  build rather than by a script a developer runs by hand.

(`ACCENT_API_KEY` used to live here for the Accent translation-sync workflows. Those
were removed in #99 — see CLAUDE.md → Deployment — so the secret is no longer read by
anything in this repo and can be revoked.)

## Runbook — provisioning Sentry source-map upload (issue #130)

**Merging the code does not turn this on.** The repo half emits, uploads and deletes
the maps; everything below is a Sentry/Cloudflare dashboard action, and until it is
done the build behaves exactly as it did before #130 — no maps, no upload, minified
frames. Nothing here can be done from this repository: Pages build configuration and
environment variables live in the Cloudflare dashboard (CLAUDE.md → Deployment).

1. **Provision the Sentry project** (if `VITE_SENTRY_DSN` is not already set — it is
   the precondition for the whole loop, since maps with no events to symbolicate are
   inert). While there, apply the two settings #108 flagged and #130 does not change:
   enable **"Prevent Storing of IP Addresses"** and set a short retention.
2. **Create an auth token for source-map upload.** An organisation token (`sntrys_…`) is
   the modern form. Grant the scopes Sentry documents for source-map upload —
   **`project:releases` and `org:read`** — and confirm them against Sentry's current docs
   when provisioning.
   **Do not read the plugin's `create`/`finalize`/`setCommits: false` as meaning no
   release scope is needed.** Those switch off the extra `releases new` / `finalize` /
   `set-commits` calls, which is why the token needs no more than the above. But the
   upload command itself is still release-scoped — the observed invocation is
   `sourcemaps upload -p <project> --release <sha> …`, because the plugin infers a
   release name from git even with all four release actions off. An under-scoped token
   403s, `errorHandler` logs it, the deploy goes green, and production ships minified
   forever — the exact state #130 exists to end, reached through its own runbook. So
   **check the build log after the first credentialed deploy**; do not assume.
3. **Add all three variables to the `sahajatlas` Pages project** —
   `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. All three or none: a build
   with the token and without the other two **fails on purpose**, rather than
   deploying green with nothing uploaded.
   - **Production: yes.** That is the build whose frames anyone will ever read.
   - **Preview: recommended but optional.** Preview deploys are what the smoke lane
     exercises, and it is where you would verify symbolication end-to-end before
     trusting it in production. The cost is one artifact bundle per preview build.
4. **`sahajatlas-design` (the Ladle playground): do NOT add them.** It builds through
   `.ladle/vite.config.ts`, which does not load the root config, so the plugin cannot
   run there. Verified: with all three set, `pnpm ladle:build` emits no maps, uploads
   nothing and its output does not contain the token.

**Verifying it once the variables are set** — the one criterion the repo cannot check
for itself, because it needs a real DSN _and_ a real token:

- Confirm the Pages build log shows the upload step and no `✗ sentry:` line.
- Confirm the deployed output still carries no maps: the build fails on its own
  (`pnpm assert:maps`) if any survived, so a successful deploy is already that proof.
- Force a real error on the deployed preview and check the Sentry issue resolves to an
  original file and line rather than a hashed chunk. An upload failure is deliberately
  **non-fatal** — the deploy proceeds without maps — so a green deploy alone does not
  prove symbolication; the build log or the issue itself does.

## In the embedded widget

When embedded, the host page supplies the API key (and optional locale) as
element props:

```html
<sahaj-atlas api-key="…" locale="en"></sahaj-atlas>
```

Add `map="false"` to render content-only (no map canvas, no Mapbox token needed).

In the standalone build the key is `?key=` on the URL, falling back to the build-time
`VITE_SAHAJCLOUD_API_KEY` — in dev **and in every deploy**, which is why `sahajatlas.com`
needs no `?key=` and a preview without that variable set does. See `src/main.tsx`,
`src/Widget.tsx` and `src/config/api/auth.ts`.

## Third-party services (no key)

- **`https://ipwho.is`** — free, keyless IP-geolocation used by `useIpLocation`
  (`src/hooks/use-ip-location.ts`) to power the passive "events near you"
  suggestion. One lookup per session via a **bare `fetch`** — deliberately not the
  shared PayloadSDK client, whose wrapped `fetch` (`interceptFetch` →
  `applyRequestContext`, `src/config/api/client.ts`) would attach the SahajCloud
  `Authorization: clients API-Key …` and `locale` to a third-party host. No secret
  and nothing to configure (the origin is a constant); the bundle is public. The
  lookup **fails silently** (returns `null`, no prompt) on any error — a host page's
  `connect-src` CSP that omits this origin simply suppresses the suggestion.

## Rule of thumb

If a value is a secret, it does **not** get a `VITE_` prefix and does **not**
appear anywhere `vite build` can inline it. Public tokens (`pk.` Mapbox) are fine
in the bundle by design.
