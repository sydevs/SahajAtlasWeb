# Changelog

All notable changes to the Sahaj Atlas widget, in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**This file is written for the sites that embed the widget.** It records what a host can
observe — the `<sahaj-atlas>` attributes, the origins the widget contacts and the CSP
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

### Added

- **This changelog**, so a host can see what changed under an embed that updates itself.
  ([#94])
- **Three privacy opt-out attributes**, all defaulting to enabled so an existing embed is
  unaffected: `analytics="false"` (never load Fathom), `geolocation="false"` (never call the
  `ipwho.is` IP-geolocation service), and `error-reporting="false"` (never send a crash to
  Sentry). ([#120], [#123])
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
  widget still writes a `theme` key to `localStorage` — deliberately noted as *not*
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
