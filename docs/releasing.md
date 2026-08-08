# Releasing the widget

How a version of `<sahaj-atlas>` is cut, what each published URL promises, and what a host
site should install. Companion to [`../CHANGELOG.md`](../CHANGELOG.md).

> **Host-facing guidance lives here only until the integrator guide lands.** Issue #93 is
> writing that guide (`docs/embedding.md`), and the two host-facing sections below —
> "What a host installs" and "Upgrading and rolling back" — belong in it. When #93 lands,
> move them and leave a link; this file should end up being about how *we* cut a release,
> not about how a host consumes one.

## The two published URLs

One build emits both. They are the same bytes; they differ only in what changing them is
allowed to do to a host.

| URL | Contains | Changes when | Install it if |
| --- | --- | --- | --- |
| `/embed.js` | latest build, always | every deploy | you want fixes the moment they ship |
| `/v<major>/embed.js` | latest build **of that major** | every deploy, until the major is retired | you want a major version bump to be something you opt into |

Both are served with `cache-control: public, max-age=0, must-revalidate`, and the chunks
they import are content-hashed and served `immutable`.

### What the versioned path does and does not promise

**It is a compatibility channel, not an immutable artifact.** `v1/embed.js` carries the
latest build of major 1 — patches and features arrive there unannounced, exactly as they do
on `embed.js`. What it buys is the ability to ship a *breaking* change to `embed.js` and
`v2/` while `v1/` keeps serving code the v1 hosts can still run.

**No URL this repo publishes can pin a build.** Cloudflare Pages serves one deployment at a
time, so `dist/` is the whole world: a file that stops being emitted stops being served,
immediately and everywhere. Pinning a *build* would need artifact hosting that keeps old
versions addressable — publishing to npm and letting jsDelivr/unpkg serve
`@sahaj/atlas@0.9.0/embed.js` is the usual answer, and it is a real option worth taking
before third-party (non-first-party) adoption. It is out of scope here; this ticket buys
the mechanism and the vocabulary, not immutability.

**A retired channel is worse than no channel**, so retiring one is a deliberate act with a
window. If `v1/embed.js` simply stops being emitted, a pinned host does not get a clean
404: `public/_redirects` is `/* /index.html 200`, so Cloudflare answers with the SPA shell
as `text/html` at 200, the host's `<script type="module">` fails to parse, and the widget
disappears with nothing in the console that names the cause. `LEGACY_CHANNELS` in
`scripts/emit-versioned-entry.mjs` is where a retired major keeps being emitted; an entry
there costs about 6 KB per deploy.

### The `0.x` caveat, in force today

`package.json` is `0.9.0`, so the emitted channel is `v0`. Under semver the `0.x` line
makes **no** compatibility promise — a minor may break anything — so `v0/embed.js` is not
worth pinning to and should not be recommended to anyone. It exists so the mechanism is
built, tested and deployed before it has to work.

**Tell hosts to install `/embed.js` today.** Pinning becomes meaningful at `v1/`.

## What a host installs

```html
<script type="module" src="https://sahajatlas.pages.dev/embed.js"></script>
<sahaj-atlas api-key="…"></sahaj-atlas>
```

The pin-vs-latest tradeoff, once `v1/` exists:

- **Latest (`/embed.js`)** — security fixes, bug fixes and new features arrive with no
  action. The cost is that behaviour can change under a page nobody is watching, and a
  regression reaches every host at once. Right for first-party sites and for anyone who
  is not going to revisit the embed.
- **Pinned (`/v1/embed.js`)** — a major bump becomes an edit the host chooses to make, so a
  renamed attribute or a dropped behaviour cannot arrive unannounced. The cost is that
  someone has to notice a new major exists and act; a host that never revisits sits on an
  increasingly stale major until it is retired. Right for a site with a change-management
  process, or an integration that leans on specific attributes.

Neither insulates a host from a bad deploy *within* a major — that is what rollback is for.

## Upgrading and rolling back

**Rollback is a Cloudflare Pages dashboard action, and it is global and instant.** Pages →
`sahajatlas` → Deployments → the last-known-good deployment → **Rollback**. Every host on
every URL is back on that build within seconds; there is no per-host or per-version
rollback, because there is no per-version artifact (see above). Prefer rolling forward with
a fix where the failure is not total.

Because the rollback restores a whole deployment, it also restores that deployment's
hashed chunks — which is what makes it safe. The reverse is what makes the failure mode
below possible.

### The cache-skew failure mode

`embed.js` is mutable while the chunks it imports are content-hashed. So a cache holding a
*stale* `embed.js` asks for chunk filenames the current deploy no longer contains, every
import 404s, and the widget dies with no fallback and no useful console message.

What contains it today:

- `embed.js` and the versioned entry are served `max-age=0, must-revalidate`, so a
  well-behaved cache revalidates before reuse and never holds a stale copy across a deploy.
- The chunks are `immutable` with a one-year max-age, which is safe precisely because a
  changed chunk ships under a new URL.
- `tests/smoke/embed.smoke.test.ts` crawls both entries against the deployed preview and
  fails if any chunk they name is missing — catching the *deploy-side* half, an entry
  published without its chunks.

What is **not** contained: a host-side proxy or a WordPress caching plugin that ignores
revalidation. Those exist, we cannot reach them, and the honest mitigation is that the
window is short and a hard refresh clears it. Do not describe this as solved.

## Cutting a release

1. **Decide the bump** from the `Unreleased` entries, per semver. For this widget the
   public API is the host-facing surface — the `<sahaj-atlas>` attributes, the published
   URLs, the CSP/origins a host must allow, and observable behaviour on a host page.
   Removing or renaming an attribute, or requiring a new CSP directive to keep working, is
   **major**. Internal refactors are not a release at all.
2. **Bump `package.json`.** The channel path is derived from it (`channelFor`), so this is
   the single source of truth — nothing else needs editing to move the path.
3. **On a major bump, add the outgoing major to `LEGACY_CHANNELS`** in
   `scripts/emit-versioned-entry.mjs`, in the same commit. Skipping this is what turns a
   release into an outage for every pinned host.
4. **Rename `## [Unreleased]` to `## [x.y.z] — YYYY-MM-DD`** in `CHANGELOG.md` and open a
   fresh empty `Unreleased` above it.
5. **Merge, and confirm the deploy is green.** The deploy is the release — there is no
   separate publish step.
6. **Tag the merge commit** `vx.y.z` and push the tag, so the changelog entry points at
   something. (The repo had zero tags before 0.9.0.)
7. **Verify the emitted paths on the live deploy** — `/embed.js` and
   `/v<major>/embed.js` should both return JavaScript, not the SPA shell:

   ```bash
   curl -sI https://sahajatlas.pages.dev/v0/embed.js | grep -i 'content-type\|cache-control'
   ```

   A `content-type: text/html` here means the channel was not emitted and `_redirects`
   answered instead. Status alone will say `200` either way.

## Dashboard-only follow-ups

**Cloudflare Pages build configuration lives in the dashboard, not in this repo** — there
is no `wrangler.toml` and no `_routes.json`. The repo controls the build output and the
three files Pages reads out of it (`_redirects`, `_headers`, `robots.txt`); it does not
control the build command, the output directory, or deployment retention. So the items
below are **not** done by merging this, and nobody should read the code as evidence that
they are:

- [ ] **Confirm the response headers on the versioned path** after the first deploy that
      emits it. The expectation is Pages' default for a static asset —
      `access-control-allow-origin: *` and `cache-control: public, max-age=0,
      must-revalidate`, the same posture `embed.js` relies on. It is deliberately *not*
      pinned in `public/_headers`: `embed.js` is not pinned either (see the comment in that
      file), and adding a rule whose path-matching semantics were never verified against a
      live deploy would be a guess wearing the clothes of a guarantee. If the observed
      headers differ, add an explicit rule then — with the observation in the commit
      message.
- [ ] **Decide the deployment-retention policy.** Rollback depends on old deployments still
      existing in the dashboard; how long Pages keeps them, and whether that is long enough
      to be the disaster plan, has not been checked.
- [ ] **Decide whether real version pinning is required before third-party adoption** —
      i.e. publishing to npm so a CDN can serve immutable `@version` paths. First-party
      sites are fine on `/embed.js`; an outside integrator asking "how do I pin?" deserves
      a better answer than "you cannot".

## Where the mechanism lives

- `scripts/emit-versioned-entry.mjs` — the Vite plugin that copies the entry to
  `v<major>/embed.js`, rebasing its `./assets/*` specifiers one directory up. Registered in
  `vite.config.ts` immediately after `flattenEntryImports`, which it asserts has run.
- `scripts/emit-versioned-entry.test.ts` — the channel name and the specifier rebase.
- `tests/smoke/embed.smoke.test.ts` — both entries against the deployed preview, asserting
  on content type and body because status cannot distinguish a missing file from the SPA
  shell.
