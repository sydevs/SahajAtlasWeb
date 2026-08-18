# Changelog

All notable changes to the Sahaj Atlas widget, in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**This file is written for the sites that embed the widget.** It records what a host can
observe — the snippet and its parameters, the origins the widget contacts and the CSP
those need, and visible behaviour. Internal refactors, CI and documentation are
deliberately left out; `git log` has those.

**Deployment is evergreen and there is no release process.** `main` deploys to
`sahajatlas.com`, roughly daily, and every embed serves that build — hosts embed from our
server rather than consuming a package, so there is nothing for them to upgrade and no
version for them to pin. `package.json` carries a version so this file has something to
organise entries under; it is a marker, not a contract.

Entries reference the pull request that landed them.

## [Unreleased]

`package.json` carries `0.9.0`. This is the first tracked version, so the entries below
cover everything a host would notice since the widget was first deployed.

### Changed

- **The widget's route is now a query parameter on your own page's URL, not a fragment.** ([#154])

  ```
  before   your-site.example/classes#!/gb/london
  now      your-site.example/classes?atlas=/gb/london
  ```

  **This is why the rest of the SEO work is possible.** No search engine has ever treated a
  fragment as a distinct URL — the `#!` scheme was deprecated in 2015 and dropped in 2018 — so
  every event on every embed used to be the same URL to a crawler. A query string is a distinct,
  indexable URL, and it needs no server configuration from you.

  Four things change for you, all of them improvements:

  - **Your page's `#anchor` is no longer our business.** The widget never reads or writes the
    fragment. A page loading at `#respond` scrolls where you expect and the widget routes normally
    beside it — where before it had to guess which of you owned the fragment, and routed off-URL
    when it guessed you did.
  - **In-widget links are real links.** Middle-click, "copy link address" and open-in-new-tab now
    give somebody a working URL on your site. Previously they produced a URL on your origin that
    usually 404'd.
  - **Share links name the event, not the screen.** Sharing from the share or registration drawer
    used to hand over the drawer's own URL; it now resolves the event's own route.
  - **Your other query parameters are preserved.** We set and read exactly one, `atlas`.

  **Old `#!/…` links are not translated.** A visitor arriving on one gets the embed's default
  route. There is no migration shim, deliberately.

  `routing=path` is accepted but not yet available — it warns in the console and uses query routing
  instead. Its prefix comes from your client record, which is not wired up yet.

- **The snippet is now a single script tag, and configuration moved onto its URL.** ([#149])

  ```html
  <!-- before -->
  <script type="module" src="https://sahajatlas.com/embed.js"></script>
  <sahaj-atlas api-key="…" map="false" locale="fr"></sahaj-atlas>

  <!-- now -->
  <script type="module" src="https://sahajatlas.com/auto.js?key=…&map=false&locale=fr"></script>
  ```

  **There is no element to add and no attribute to set.** `<sahaj-atlas>` and all nine
  attributes are gone; the script inserts the element where you put the tag, and every setting
  is a query parameter. `api-key` became **`key`**; every other name is unchanged, and the
  `false`/`0` rule for the boolean parameters is unchanged.

  Why, since it is your platform rather than our preference that forces it: WordPress strips
  `<script>` and unknown attributes from saved content for anyone below Administrator — and for
  **every** Site Administrator on multisite — while Wix gives you a bare script URL plus its own
  attribute panel. One mechanism on the URL behaves identically everywhere, and the only thing a
  sanitizer can now destroy is the whole snippet, which is a visible failure rather than a widget
  that mounts with half its settings missing.

  **The parameter list is deliberately shorter than the attribute list was.** Six in total:
  `key`, `locale`, `map`, `routing`, `atlas` and `compact`.

  - `base-path` became **`atlas`**, and it is now a _default_ rather than an override: a route
    already on your page's own URL always wins, because that is a visitor who deep-linked or
    followed a shared link.
  - **`analytics`, `geolocation` and `error-reporting` are gone.** Each flow is designed so that
    it does not need an opt-out — analytics is cookieless and aggregate, crash reports carry no
    cookies or session replay and reduce your page to origin and path, and the location lookup is
    a keyless city lookup whose answer is discarded. If one is still a problem for your privacy
    notice, it becomes a setting on your client record rather than something a page editor can
    flip.
  - **`name`, `primary-color` and `secondary-color` are gone.** Your display name and palette are
    the same on every page you embed on, so they live on your client record — making them
    per-embed only created the opportunity for two of your pages to disagree.
  - **`mount` is gone.** The path prefix for `routing=path` comes from your client record, which
    is the same value your canonical URLs are composed from — a second copy on a script tag could
    disagree with it, and a canonical that names a URL not restoring the view is the exact failure
    canonicals exist to prevent.

  A leftover value for any removed parameter is ignored rather than misread.

- **The file you load is `auto.js`, a ~3 KiB loader — not the widget.** ([#149]) It works out
  what your page supports and fetches the widget only when the embed is near the viewport. An
  embed below the fold now costs your visitors **3 KiB instead of 372 KiB** until they scroll to
  it, which is a direct improvement to your page's Core Web Vitals.

  `embed.js` still exists at the same origin but is no longer a file you reference — it is what
  `auto.js` fetches. **Pointing a snippet at `embed.js` will no longer work**, because it no
  longer reads any configuration of its own.

  Put the snippet in the body, without `async` or `defer`: the loader reads its own tag to find
  both its settings and its position.

- **The widget now reports what it observed about your page** — top-level or framed, whether the
  URL can be written, whether a query parameter survives your router — and only when that has
  changed since last time, so the steady state is no requests at all. It sends your page's
  **origin and path only**; the query string and fragment are never included, the same rule crash
  reports already follow. It is what lets us tell which of your pages can act as the canonical
  atlas page for your region without asking you to keep that answer up to date by hand. ([#149])

- **An element removed and immediately re-added — what page builders like Elementor do when they
  rearrange a layout — no longer throws away the cached data.** Teardown now waits a moment for
  the element to come back. ([#149])

- **A second copy of the snippet now says so.** The loader marks the element it takes charge of,
  so a duplicate renders nothing and logs a console warning instead of silently adopting the first
  widget and discarding its own settings. One widget per page remains a real constraint: two would
  both write the same `?atlas=` parameter and fight over it. ([#149])

- **Both root files now revalidate instead of going stale.** ([#148]) `auto.js` and
  `embed.js` are served with `Cache-Control: public, max-age=0,
must-revalidate`, pinned rather than left to the CDN default. The production domain had been
  serving a four-hour freshness window on files that import content-hashed chunks by name — the
  stale-loader failure the guide warns about — while the `pages.dev` host every check ran against
  served `max-age=0`. Nothing for you to change; if you cache these at your own edge, don't.

### Added

- **This changelog**, so a host can see what changed under an embed that updates itself.
  ([#94])
- **Opt-in crash reporting via Sentry**, behind the build-time `VITE_SENTRY_DSN`. With no
  DSN configured nothing is fetched or sent. The SDK is lazy-loaded, the host page's URL
  query and fragment are stripped from reports, the scope is isolated from any Sentry the
  host runs itself, and the transport latches off after a single CSP refusal rather than
  retrying per error. ([#123])
- **Add-to-calendar links** (Google, Apple/ICS, Outlook.com, Office 365, Yahoo) on the
  registration confirmation. ([#127])
- **A pause control on the image carousel**, keyboard-operable and localized; autoplay is
  suppressed entirely under `prefers-reduced-motion`. ([#119])
- **An accessible name and landmark on the widget root** — `lang`, `dir` and a localized
  `role="region"`. ([#112])

### Changed

- **The eager first-load payload fell by roughly 100 KiB gzipped** — 481.8 → 382.1 KiB
  standalone and 483.3 → 383.6 KiB for the embed — by moving the calendar, registration and
  share drawers behind lazy seams and flattening the embed's import graph so a host
  discovers the whole eager graph in one parse. A later dependency bump took both to
  ~370 KiB. ([#121], [#137])
- **Hosts must allow `script-src` for the origin the widget is loaded from.** Code splitting
  means the entry now fetches further chunks at runtime, so a policy that allows the
  `<script>` tag but not subresource fetches yields a widget that loads and then fails on
  the calendar, registration and share presses. ([#121])
- **`connect-src https://*.sentry.io` is a new (optional) ask**, only relevant to a
  DSN-configured build. Omitting it is supported. ([#123])
- **Fewer requests from the host page**: a 30-second global freshness floor, retries cut to
  one with jitter and never on a 4xx, and hover-prefetch gated behind a 150 ms dwell with at
  most two in flight. ([#118])
- **Only one `<sahaj-atlas>` per page.** A second concurrent element is now refused with a
  console warning rather than silently sharing the first element's API key and theme root,
  and a duplicated `embed.js` script tag is a no-op with a note instead of throwing a
  `NotSupportedError` into the host page. The element releases its claim when disconnected,
  so a page builder re-rendering its canvas is not locked out. ([#112])
- The results list is capped at 400 revealed rows, down from 1,000, to bound the DOM the
  widget grows inside a page it does not own. ([#125])
- Swiper upgraded from 11 to 12. ([#119])

### Fixed

- **The widget no longer restyles the host page.** Every selector it ships is confined under
  `:where(.sy-atlas)` and every `@keyframes` is namespaced by a build-time PostCSS pass,
  with a post-build gate (`pnpm assert:css`) that reads the CSS back out of the emitted
  bundle and fails the build if anything escapes. Previously Tailwind's Preflight reset
  shipped unscoped and restyled host typography, links, lists and forms. Measured at zero
  changed properties across 18,050 comparisons on a cross-origin host page. Two documented
  exceptions remain: an open modal sets `overflow: hidden` on the host `<body>`, and
  Mapbox/Swiper register a few document-global `@font-face` names. ([#113], [#119])
- **A host URL carrying a pre-existing `#anchor` no longer renders the widget blank.**
  `#respond`, `#comment-123` and similar — routine on WordPress — used to leave the widget
  rendering nothing at all. The widget now recognises a fragment that is not its own, leaves
  the URL untouched and routes in memory. On such a page the widget's own route is not
  deep-linkable and Back leaves the host page. ([#112])
- **The initial hash write no longer pushes a host history entry** — it replaces, so the
  first Back press is not swallowed. ([#112])
- **The embed no longer writes `og:locale` into the host `<head>`.** ([#112])
- Two `404`s per page load for a non-existent `/locales/en-US/*.json`. ([#120])
- i18next debug logging into every host page's console. ([#120])
- Pageviews are no longer posted into a host's own pre-existing Fathom tracker, and
  auto-tracking no longer records the host page's real URL and query string. ([#120])
- A `?locale=cimode` read off the host URL is refused — it is i18next's translator-debug
  pseudo-language and would render an embed as raw dotted key names. ([#120])
- Form errors are announced to assistive technology and focus moves to the first invalid
  field; `prefers-reduced-motion` is honoured across the animation, drawer and map layers.
  Two WCAG AA failures closed. ([#126])
- **The report-issue form actually delivers.** It previously validated, passed its captcha,
  then showed a confirmation without sending anything. It now posts to SahajCloud, and the
  thank-you screen is derived from a resolved request and nothing else. ([#135])

### Removed

- **`fonts.googleapis.com` and `fonts.gstatic.com` can be dropped from a host's CSP.**
  Raleway is self-hosted; the widget makes no request to a font CDN. ([#113])

### Security

- **The widget no longer writes `i18nextLng` to the host origin's storage.** Language
  detection reads the query string and the browser's own setting, and caches nothing. The
  widget still writes a `theme` key to `localStorage` — deliberately noted as _not_
  namespaced, so it can collide with a host's own `theme` key — plus a dismissal flag in
  `sessionStorage` and, when the map renders, two `mapbox.*` keys. ([#120])
- **CMS-authored event descriptions are genuinely allow-listed.** A misconfigured sanitizer
  option had been silently widening the policy to the full HTML profile (~117 tags), so
  authored `style` (a `position: fixed; inset: 0` overlay over the host page), `img src`
  beacons and `form`/`input` credential prompts could render into a host page. `data-*` and
  `aria-*` attributes are now off, and `target` is normalized so only `_blank` survives.
  ([#137])
- Dependency advisories cleared, including the one critical (Swiper prototype pollution) and
  the react-router and DOMPurify backlogs. A dependency-audit gate now runs in CI. ([#119],
  [#128], [#137])
- Every anchor the app renders passes one shared href predicate, closing protocol-relative
  (`//evil.com`) and non-allowlisted-scheme hrefs. Defense in depth — no live hole was
  found. ([#111], [#136])

[#148]: https://github.com/sydevs/SahajAtlasWeb/pull/148
[#154]: https://github.com/sydevs/SahajAtlasWeb/pull/154
[#149]: https://github.com/sydevs/SahajAtlasWeb/pull/149
[#94]: https://github.com/sydevs/SahajAtlasWeb/issues/94
[#111]: https://github.com/sydevs/SahajAtlasWeb/pull/111
[#112]: https://github.com/sydevs/SahajAtlasWeb/pull/112
[#113]: https://github.com/sydevs/SahajAtlasWeb/pull/113
[#118]: https://github.com/sydevs/SahajAtlasWeb/pull/118
[#119]: https://github.com/sydevs/SahajAtlasWeb/pull/119
[#120]: https://github.com/sydevs/SahajAtlasWeb/pull/120
[#121]: https://github.com/sydevs/SahajAtlasWeb/pull/121
[#123]: https://github.com/sydevs/SahajAtlasWeb/pull/123
[#125]: https://github.com/sydevs/SahajAtlasWeb/pull/125
[#126]: https://github.com/sydevs/SahajAtlasWeb/pull/126
[#127]: https://github.com/sydevs/SahajAtlasWeb/pull/127
[#128]: https://github.com/sydevs/SahajAtlasWeb/pull/128
[#135]: https://github.com/sydevs/SahajAtlasWeb/pull/135
[#136]: https://github.com/sydevs/SahajAtlasWeb/pull/136
[#137]: https://github.com/sydevs/SahajAtlasWeb/pull/137
