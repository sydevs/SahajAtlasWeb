# Environment

Vite exposes only **`VITE_`-prefixed** environment variables to client code, through
`import.meta.env.VITE_*`. Every `VITE_` variable ships inside the public bundle — anyone can
read it in the browser. A variable without that prefix stays build-time only: Vite never inlines
it into client code. So a secret must never carry the `VITE_` prefix, and a `VITE_` variable must
never hold a secret. This is the rule that decides where a new variable belongs, and the only
place it is stated — everywhere else in this repo just points here.

## Files

- **`.env`** — committed, non-secret defaults (API endpoint, host).
- **`.env.local`** — gitignored (matched by `*.local` in `.gitignore`). Put secrets and
  machine-specific overrides here. **Never commit it.**

## Variables

| Variable                   | Where                         | Purpose |
| --------------------------- | ----------------------------- | ------- |
| `VITE_SAHAJCLOUD_URL`      | `.env`                        | SahajCloud origin. The client appends `/api`. Default `https://cloud.sydevelopers.com`. Local backend: `http://localhost:3000`. |
| `VITE_HOST`                | `.env`                        | Origin used to load `public/locales/<lng>/<ns>.json` over HTTP. This must be an absolute URL. The widget runs on the host's page, but its translations live wherever the bundle came from. A relative path would resolve against the host's origin instead. **On Cloudflare it defaults to `CF_PAGES_URL`** (the deployment's own URL) when nothing explicit is set (`vite.config.ts`). Each preview deployment has its own host, so no static value works there. Production sets this in the dashboard, so the default never applies there, and hosts still fetch from `sahajatlas.com` as `docs/embedding.md` promises. ⚠ **A wrong value does not degrade — it blanks the page**. Shipping the `localhost:5174` default to a `pages.dev` origin makes every locale fetch a blocked private-network request. i18next's `init` never resolves. Every component reading a translation then suspends forever — exactly what every preview deploy did until this was fixed. |
| `VITE_TURNSTILE_SITE_KEY`  | `.env`                        | Cloudflare Turnstile **site** key for the report-issue form. Public by design — the secret half lives in SahajCloud — so this is committed. `.env` holds Cloudflare's always-passes test key `1x00000000000000000000AA` for dev, Ladle, and CI. Production overrides it in the Cloudflare Pages environment. Unset, the form defaults to `mailto:`. **Since #103 this key is load-bearing, not decorative.** The form now sends a real email through SahajCloud's captcha-gated endpoint. In production, the test key then makes that captcha a no-op. A site key that does not pair with SahajCloud's `TURNSTILE_SECRET_KEY` makes every report fail with a 403 `captcha_failed`. The viewer sees only one sentence of text for this. |
| `VITE_SENTRY_DSN`          | Cloudflare                    | Sentry ingest DSN for automatic error reporting (issue #108). Use the **modern public-key form** `https://<key>@<host>/<project>`. The legacy `https://<key>:<secret>@…` form puts a real secret in the public bundle. A DSN is write-only, so it is public by design. This repo still does **not** commit it to `.env`: a committed DSN would send every fork, preview, and `pnpm dev` into the production project. Set it per environment in the Cloudflare Pages dashboard. Also add its host to the integrator CSP guidance in `README.md` — the ingest host is regional (`o…​.ingest.us.sentry.io`) for orgs created since 2024. **Unset, `reportInternalError` only logs to the console** — the SDK chunk is never fetched. Hosts can decline it per embed with `error-reporting="false"`. |
| `SENTRY_AUTH_TOKEN`        | Cloudflare                    | **Build-time only, and a real secret** (issue #130). It carries no `VITE_` prefix, so Vite cannot inline it. **`pnpm assert:maps` also greps every emitted file for its value** and fails the build if it appears — a gate, not a habit. Its presence switches source-map upload on. Set: `build.sourcemap: 'hidden'`, and `@sentry/vite-plugin` uploads the maps, then deletes them. Unset: **no maps are emitted at all**, and the build matches one from before #130 byte-for-byte. See runbook step 2 for the token scopes it needs. The plugin never creates, finalizes, or sets commits on a release. Still, the upload call stays release-scoped. |
| `SENTRY_ORG`               | Cloudflare                    | Sentry organisation slug. Build-time only. Required **whenever `SENTRY_AUTH_TOKEN` is set** — a half-configured build fails loudly instead of shipping green with every frame still minified. |
| `SENTRY_PROJECT`           | Cloudflare                    | Sentry project slug. Build-time only, with the same requirement as `SENTRY_ORG`. |
| `VITE_MAPBOX_ACCESSTOKEN`  | `.env.local`                  | Mapbox GL **public** token (`pk.…`) — safe to ship in the bundle. |
| `VITE_SAHAJCLOUD_API_KEY`  | `.env.local` **+ Cloudflare** | Published `sahaj-atlas-client` API key, sent as `Authorization: clients API-Key …`. **Not dev-only.** The standalone build defaults to it when the URL carries no `?key=` (`main.tsx`: `searchParams.get('key') \|\| import.meta.env.VITE_SAHAJCLOUD_API_KEY`). This is why `sahajatlas.com` renders keyless — Pages sets it in the **Production** environment. ⚠ **Set it in the Preview environment too.** Without it, every preview deploy answers `Missing api key` and shows the configuration-error screen. A reviewer must then append `?key=…` by hand. Unlike `VITE_HOST`, this cannot default in `vite.config.ts` — there is no Cloudflare-provided fallback. It must also stay out of the committed `.env`, or every fork and every `pnpm dev` would carry it. |
| `VITE_WEMEDITATE_MAP_URL`  | `.env`                        | Where a **framed** embed sends a visitor when its frame is too small for the interface (#161). A frame cannot expand — `position: fixed` resolves against the frame — so the compact card's button opens this URL in a new tab. Public by design. It is a **default, not a final answer**: per-region canonical ownership (SahajCloud #634) will eventually replace it with the region owner's own site. An invalid or non-`https:` value defaults to the literal default instead of reaching the anchor. The `Button` atom refuses an unsafe href by rendering an unlabelled `<span>`. Otherwise, a typo would ship an embed with no way out. ⚠ **The link carries no route today**: `wemeditate.com/map` serves the legacy hash-routing build until the origin cutover (#148 Part 2), so an appended `?atlas=` is silently dropped. |
| `VITE_FATHOM_ID`           | `.env.local`                  | Fathom analytics site id (optional). Analytics is disabled when unset or on localhost. |
| `SAHAJCLOUD_DOCS_PASSWORD` | `.env.local`                  | HTTP basic-auth password for the SahajCloud OpenAPI docs. Used **only** by the `pnpm types:openapi` script. Never `VITE_`-prefixed — tooling-only, never in the bundle. |

## Secrets that must NOT reach the client

- `MAPBOX_SECRET_ACCESSTOKEN` (`sk.…`) — a Mapbox **secret** token, for its token-management
  API. It carries no `VITE_` prefix and must never appear in client code or in a commit. The
  `security-scan` hook blocks staged files containing `sk.`/secret patterns.

- `SENTRY_AUTH_TOKEN` — see the table above. Build-time only, never `VITE_`-prefixed. It is the
  **only** secret in this repo read by a build rather than run by hand.

(`ACCENT_API_KEY` used to live here, for the Accent translation-sync workflows. Those were
deleted in #99 — see `AGENTS.md` → Deployment — so nothing in this repo reads that secret now,
and it can be revoked.)

## Runbook — provisioning Sentry source-map upload (issue #130)

**Merging the code does not turn this on.** This repo's half emits, uploads, and deletes the
maps. Everything below is a Sentry or Cloudflare dashboard action. Until you do it, the build
behaves exactly as it did before #130: no maps, no upload, minified frames. Nothing here happens
from this repository — Pages build configuration and environment variables live in the
Cloudflare dashboard (`AGENTS.md` → Deployment).

1. **Provision the Sentry project** (skip if `VITE_SENTRY_DSN` is already set — it is the
   precondition for the whole loop, since maps with no events to symbolicate are inert). While
   there, apply the two settings #108 flagged, which #130 does not change: enable **"Prevent
   Storing of IP Addresses"** and set a short retention.
2. **Create an auth token for source-map upload.** An organisation token (`sntrys_…`) is the
   modern form. Grant the scopes Sentry currently documents for source-map upload —
   **`project:releases` and `org:read`** — and check them against Sentry's docs when you
   provision.
   **The plugin's `create`/`finalize`/`setCommits: false` settings do not mean the token needs
   no release scope.** Those settings only switch off the extra `releases new`, `finalize`, and
   `set-commits` calls. The upload command itself stays release-scoped: the actual call is
   `sourcemaps upload -p <project> --release <sha> …`, because the plugin infers a release name
   from git even with all four release actions off. An under-scoped token receives a 403.
   `errorHandler` logs it, the deploy goes green, and production ships minified forever — the
   exact state #130 exists to end, reached through its own runbook. So **check the build log
   after the first credentialed deploy.** Do not assume it worked.
3. **Add all three variables to the `sahajatlas` Pages project** — `SENTRY_AUTH_TOKEN`,
   `SENTRY_ORG`, `SENTRY_PROJECT`. Set all three, or none: a build with the token but not the
   other two **fails on purpose**, instead of deploying green with nothing uploaded.
   - **Production: yes.** These are the frames anyone will ever read.
   - **Preview: recommended, not required.** The smoke lane exercises preview deploys, so this
     is where to check symbolication end-to-end before trusting it in production. The cost is
     one artifact bundle per preview build.
4. **`sahajatlas-design` (the Ladle playground): do NOT add them.** It builds through
   `.ladle/vite.config.ts`, which never loads the root config, so the plugin cannot run there.
   Verified: with all three variables set, `pnpm ladle:build` still emits no maps, uploads
   nothing, and its output carries no token.

**Checking it once the variables are set.** The repo cannot check this itself — it needs a real
DSN and a real token:

- Check that the Pages build log shows the upload step, with no `✗ sentry:` line.
- Check that the deployed output still carries no maps. The build fails on its own
  (`pnpm assert:maps`) if any survive, so a successful deploy is already that proof.
- Force a real error on the deployed preview. Check that the Sentry issue resolves to an
  original file and line, not a hashed chunk. An upload failure is deliberately **non-fatal** —
  the deploy proceeds without maps — so a green deploy alone does not prove symbolication. Only
  the build log or the issue itself proves it.

## In the embedded widget

When embedded, the host page supplies the API key (and optional locale) as element props:

```html
<sahaj-atlas api-key="…" locale="en"></sahaj-atlas>
```

Add `map="false"` to render content only — no map canvas, no Mapbox token needed.

In the standalone build, the key comes from `?key=` on the URL, falling back to the build-time
`VITE_SAHAJCLOUD_API_KEY` — in dev **and in every deploy**. This is why `sahajatlas.com` needs no
`?key=`, and why a preview without that variable set does. See `src/main.tsx`, `src/Widget.tsx`,
and `src/config/api/auth.ts`.

## Third-party services (no key)

- **`https://ipwho.is`** — free, keyless IP-geolocation, used by `useIpLocation`
  (`src/hooks/use-ip-location.ts`) to power the passive "events near you" suggestion. One lookup
  per session, through a **bare `fetch`** — deliberately not the shared PayloadSDK client, whose
  wrapped `fetch` (`interceptFetch` → `applyRequestContext`, `src/config/api/client.ts`) would
  attach the SahajCloud `Authorization: clients API-Key …` and `locale` to a third-party host.
  There is no secret and nothing to configure — the origin is a constant, and the bundle is
  public. The lookup **fails silently** (returns `null`, no prompt) on any error, so a host
  page's `connect-src` CSP that omits this origin just suppresses the suggestion.
