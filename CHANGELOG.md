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

- **The icon set is now [Lucide](https://lucide.dev).** The glyphs previously mixed three
  sources at different grids and stroke weights, some filled and some outlined; they are now one
  family — 24px grid, 2px stroke, outline only. Icons still take their colour from surrounding
  text, so a themed embed is unaffected. The share row's network marks are unchanged.

- **The widget now follows your page's language.** ([#165]) It reads `<html lang>` and matches it,
  so a Dutch page gets a Dutch atlas whatever the visitor's browser prefers. Full precedence:
  `?locale=` on the page → `locale` on the script URL → **`<html lang>`** → the browser → English.
  ⚠ **The `locale` field on your client record is no longer read** — a record-level language says
  it once for every page you embed on, where `<html lang>` says it per page and your CMS already
  sets it. If you were relying on that field, set `locale` on the script URL instead, or check that
  your pages declare the language you want.

- **The widget's typeface is now Rethink Sans**, replacing Raleway. It is still self-hosted, so
  nothing changes for your CSP and no visitor IP reaches a font CDN. The `@font-face` family is
  now `Atlas Rethink Sans` (it was `Atlas Raleway`) — still deliberately not the plain typeface
  name, so it cannot override a face your own page self-hosts. Russian and Ukrainian keep Raleway,
  which the new typeface has no Cyrillic subset for; the two are split by `unicode-range` under
  the one family name, so no page ever mixes them. If you were keying off the old family name, or
  overriding it with `--sy-font-sans`, update the name.

### Added

- **A reader answering a post-event feedback email now lands in the atlas, not on a dead-end
  card.** ([#181]) People who register for a class get a follow-up asking whether it took place;
  both answers now redirect to your site — the class's own page for "yes", its region page for
  "no" — carrying **`?feedback=confirmed`** or **`?feedback=denied`**. The widget shows a short
  acknowledgement the reader can dismiss, and then removes that parameter with a
  `history.replaceState`, so it never lingers in a copied link or reappears on a reload. **Nothing is required of you:** the
  links come from the CMS, your own query parameters come through byte-for-byte unchanged, and the
  canonical URL the widget emits still has no `feedback` on it, so the two answers cannot be
  indexed as duplicates of a page you already have. A `feedback` value the widget does not
  recognise is left alone, on the assumption that it is yours.

- **"Find my location" now opens the classes near the visitor, not just a street corner.**
  Pressing it used to zoom the map to the visitor's own address and leave the list showing whatever
  it showed before. It now opens the distance-ranked results centred on them, framed to take in the
  nearest few classes, with the place named in the search field. ⚠ **`geolocation` must be allowed
  for this to work at all** — it is already in the iframe snippet's `allow` attribute and in the
  Permissions Policy table, and it fails silently when it is missing.
- **A visitor's language choice now appears in your page's URL.** Picking a language from the
  settings menu adds **`?locale=<code>`** to your address with a `history.replaceState` — so the
  choice survives a reload and travels in a copied link. Your own query parameters, path and
  fragment are untouched, and no history entry is added. ⚠ **This reorders the `locale`
  precedence**: a `?locale=` naming a language the atlas ships now outranks the `locale` on your
  script URL, so that a shared link opens in the language it was shared in. If you pin `locale` and
  need it to win unconditionally, say so and we will look at it.
- **A map embed can now live inside an element on your page, instead of only taking the whole
  window.** ([#170]) **Give `<sahaj-atlas>` a `display: block` and a height and the map stays in
  that box** — your site's header above it, your content below, nothing painting over either.
  Everything the widget draws, panels and controls included, sits in one stacking context, so its
  `z-index` values no longer compete with yours: a sticky header of yours floats over the map the
  way it floats over any other content. Inside a box the widget also measures **that box** rather
  than the browser window, so a narrow contained map gets the bottom sheet and its drag handle,
  exactly as `map=false` already did ([#107]).

  ⚠ **This reverses what an explicit height used to mean.** A map embed you had given a height
  was read as evidence it did not own the page and rendered the [compact card]; it now renders the
  map in your box. If you were relying on the card, remove the height. A map embed with **no**
  height is unchanged — it still fills the window, and still degrades to the card when it does not
  have the page to itself. ⚠ One case is worth checking: an element that is a **flex or grid item
  in a sized track** already has a height from that track, without any rule naming `<sahaj-atlas>`,
  so it becomes contained too. That is usually what you want — your layout had already said where
  the widget goes — but it is the one way this changes without your having written a height. See
  [Sizing the element] — which also covers the two ways to size an element that do **not** work
  (`min-height` alone, and `display: inline-block`), both of which the widget now refuses out loud
  rather than rendering into a box it cannot fill.

- **`routing=path` now works.** ([#164]) Your widget's route can live in the path —
  `your-site.org/classes/gb/london` — instead of in `?atlas=`. It needs your server to serve the
  same page for everything under the prefix, and a canonical embed on your client record to say
  what that prefix is; the prefix is deliberately not a script parameter, because it is the same
  value your canonical URLs are built from and two copies could disagree. **Missing either one
  falls back to query routing and logs which was missing** — it never silently behaves as a
  different mode. In path mode the widget writes its own state to the real query string and leaves
  every parameter it does not own alone. See [Routing](docs/embedding.md).

- **A slot too small for the interface now gets a compact card instead of a cramped one.**
  ([#161]) The widget shows one button — "Find a class near you" — that opens the whole
  interface somewhere it fits, and closes back to where you were.

  **The card is the button.** It takes only the room it needs, centred across whatever box
  you gave; an element with **no height of its own** sizes to the card's content instead of
  collapsing, so a bare `<sahaj-atlas>` in a column renders in your page's flow rather than
  appearing not to render. It renders **no events and makes no location lookup**. It is not silent, though — the widget
  still reads your client record, warms its caches and sends its one-per-load embed report while
  the card is collapsed.

  **Where the button goes depends on whether the widget can grow where it is.** On your page it
  opens a full-screen overlay. **Inside an iframe it opens a new tab instead** — an overlay in a
  frame would only cover the frame — which makes the compact card work for iframe embeds for the
  first time. See [Embedding in an iframe] for the snippet and the `allow` attribute it needs.

  **A map embed that does not have your page to itself now renders the card too**, whose button
  opens the map full-screen. Previously it warned in your console and then painted over your
  page anyway. Note a frame _is_ a viewport, so `map=true` works normally inside one.

  The floors are 360×420px, and there is a second condition worth knowing: **the widget only
  degrades when there is somewhere bigger to go.** A full-width embed on a phone, or a small
  iframe on a small screen, keeps the normal interface — a card there would take the interface
  away and hand back nothing.

  Four things a host can observe. The measurement happens **once, at mount**, so resizing your
  page does not switch between the two — remounting would discard wherever the visitor had
  navigated to. Entering the card **logs one console warning** naming what was measured and what
  to change. The overlay **keeps a margin, so your page stays visible behind it, and clicking
  that margin closes it** — along with Escape and the × in the corner. It **locks your page's
  scroll while it is open**, restoring it on close,
  and marks the rest of your page `aria-hidden` while it covers it; Escape steps outward through
  the widget and then closes it. And **a deep link now opens the route**: `?atlas=` on
  your page's URL makes the widget load immediately rather than waiting to be scrolled to, and
  opens straight onto that route. The `atlas` parameter on the _script_ URL is your default view
  and does not do this.

  ⚠ The overlay is `position: fixed`, so an ancestor of your embed carrying `transform`,
  `filter` or `contain` confines it to that element instead of covering the page. That was
  already true of the map. Clicking outside it or pressing Escape still closes it wherever it
  has been confined to, so this is a cosmetic problem rather than a trap. See
  [Sizing the element].

- **The widget documents the browser permissions it needs.** ([#161]) `geolocation`,
  `clipboard-write` and `web-share`, which a cross-origin iframe denies by default and a
  `Permissions-Policy` header on your own page can deny to a script embed. All three fail
  **silently** — the locate control does nothing, copy-link does nothing, the share sheet never
  opens — so there was no way to discover this from the widget. See [Permissions Policy].

### Removed

- **The `compact` parameter is gone.** ([#161]) It was documented with three values (`auto`,
  `always`, `never`) and read by nothing, so no embed's behaviour changes by removing it; a
  stray `compact=` on your script URL is now ignored like any other unknown parameter. The
  widget measures, and there is no longer a way to override that — a knob for a measurement we
  can get right is a setting you would have to maintain forever, so a slot measured wrongly is
  a bug worth reporting instead.

### Changed

- **The widget no longer names itself anywhere a visitor can see.** ([#156]) The accessible name of
  the embed's landmark, the "on Sahaj Atlas" link on the share and registration cards, the
  app-level error title, the calendar file's `PRODID` and the typeface's family name are all
  neutral now, across all ten locales. The atlas reads as your events feature, not as a product
  inside your page.

  The event-details card on the share and registration drawers **no longer carries an outbound
  link** to the event's own atlas page. It was never correct — and once canonical URLs point at the
  owning site it would have become a link from your page back to your page.

- **Your CSS can no longer reach into the widget** — with one documented exception. ([#156]) A
  global `button { … }`, `a { color: … }`, `letter-spacing` or `font-family` on your page used to
  restyle the widget's insides; it now stops at the boundary. **A rule carrying `!important` still
  gets through**, because outranking it would mean using `!important` ourselves and beating our own
  styles too — see the note in the integrator guide.

- **You can set the widget's typeface** to one your page already loads, with the `--sy-font-sans`
  custom property. No extra request, no CSP change; unset, it uses the self-hosted face as before.

### Fixed

- **Switching language no longer re-encodes the rest of your page's URL.** ([#181]) When a visitor
  picked a language, the widget rewrote the whole query string rather than the one parameter it was
  adding — so a readable `?atlas=/gb/london` came back as `?atlas=%2Fgb%2Flondon`, and a parameter
  of your own carrying `%20` came back with a `+`. Both forms mean the same thing to any parser, so
  nothing broke; what suffered was the legibility of a link a visitor copies. The widget now edits
  only the pair it is writing and leaves every other pair byte for byte as your page had it.

- **Tapping a pin from a set of search results no longer zooms out to the whole world first.**
  The map now goes straight from the search to the class. The outgoing panel was still steering the
  camera for a moment after the visitor had left it, and reset the view to the whole planet a beat
  before the class was framed — so the map zoomed all the way out and then flew all the way back in.
  Pressing Search from inside a region no longer throws the map out to the world either.
- **Opening a link straight to a region or a class arrives there instead of flying in from space.**
  The map used to appear showing the whole world and then play a long zoom across it to reach the
  place the link named. It now loads quietly behind a blurred panel and is simply _there_ when it
  is ready. Moving between levels inside the atlas still animates, unchanged.
- **The language menu lists every language in its own language.** It was labelling the options in
  whatever language was currently on screen — so a French visitor looking for English was offered
  "anglais", and someone who could not read the current language had no way to find their own. The
  list now reads: čeština, Deutsch, English, español, français, magyar, Nederlands,
  português (Brasil), русский, українська.

- **The `theme` storage key is namespaced.** ([#156]) It was the bare string `theme`, so a page
  storing its own light/dark preference under that name had it read and overwritten by the widget —
  a collision the integrator guide has admitted for months. It is now `atlas.theme`, and the old key
  is read once (never written) so nobody loses a choice they already made.
  `sahajAtlas.geolocationPromptDismissed` becomes `atlas.geolocationPromptDismissed` at the same time.

- **Structured data no longer credits the wrong organisation.** ([#156]) The `schema.org/Event`
  JSON-LD hardcoded "We Meditate" as the organizer of every event in the world. It now takes the
  name from your client record, and **omits the field entirely** when there isn't one — an absent
  optional property being better structured data than a confidently false one.

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

  `routing=path` shipped later in this same release — see its entry above.

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

- **The widget now observes what kind of embed your page has** — top-level or framed, whether the
  URL can be written, whether a query parameter survives your router. It is what lets us tell
  which of your pages can act as the canonical atlas page for your region without asking you to
  keep that answer up to date by hand. ([#149]) Nothing left your page for this until the
  receiving endpoint existed; see the embed report under **Added** for what is sent, and when.

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

- **A readiness marker on your `<html>` element**, set once the widget has actually
  mounted and removed again if it unmounts:
  `data-sahaj-atlas-ready='{"v":2,"routing":"query","topLevel":true,"urlWritable":true}'`.
  It exists so the CMS can load your page and confirm for itself that the embed works
  before treating it as your region's canonical page — what the widget claims about itself
  is not evidence. It is written after render, never on script load, and nothing on your
  page needs to read it. ([#159])
- **The embed report is now actually sent**, to `POST /api/clients/report` on the API
  origin your CSP already allows — no policy change needed. Three things a host can
  observe. It reports on **every** load rather than only when something changed, so "last
  seen" distinguishes a live embed from a removed one; repeat reports of an unchanged page
  collapse server-side into at most one write an hour. It still sends your **origin and
  path only**, with one exception: a WordPress **`?p=<number>`** permalink is preserved,
  because discarding it reported every post on a default-permalink site as the same page.
  Anything else in the query is still dropped, `?p=123&utm_source=…` included. And a
  refusal — your domain missing from the service's allowed-domains list, or the 50-mount
  cap — is a console message, never an error in your page. ([#159])
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

[#159]: https://github.com/sydevs/SahajAtlasWeb/pull/159
[#148]: https://github.com/sydevs/SahajAtlasWeb/pull/148
[#156]: https://github.com/sydevs/SahajAtlasWeb/pull/156
[#161]: https://github.com/sydevs/SahajAtlasWeb/pull/161
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
[#164]: https://github.com/sydevs/SahajAtlasWeb/pull/164
[#170]: https://github.com/sydevs/SahajAtlasWeb/pull/170
[#181]: https://github.com/sydevs/SahajAtlasWeb/pull/181
[#107]: https://github.com/sydevs/SahajAtlasWeb/issues/107
[Sizing the element]: docs/embedding.md#sizing-the-element
[compact card]: docs/embedding.md#when-the-slot-is-too-small
[Embedding in an iframe]: docs/embedding.md#embedding-in-an-iframe
[Permissions Policy]: docs/embedding.md#permissions-policy
