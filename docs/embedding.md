# Embedding Sahaj Atlas

Everything a host site needs to put the atlas on a page: the snippet, the parameters, the
Content-Security-Policy contract, sizing, what the widget does to your page, what leaves your
visitor's browser, and what to check when it doesn't work.

This is the host-facing reference. [`CLAUDE.md`](../CLAUDE.md) is the developer guide and
[`CHANGELOG.md`](../CHANGELOG.md) records what changes under an embed that updates itself.

## Contents

- [Quick start](#quick-start)
- [Where to load it from](#where-to-load-it-from)
- [Parameters](#parameters)
- [Sizing the element](#sizing-the-element)
- [The URL, and your page's fragment](#the-url-and-your-pages-fragment)
- [Content-Security-Policy](#content-security-policy)
- [Browser support](#browser-support)
- [What the widget does to your page](#what-the-widget-does-to-your-page)
- [Privacy, storage and third-party requests](#privacy-storage-and-third-party-requests)
- [Updates and caching](#updates-and-caching)
- [Troubleshooting](#troubleshooting)

## Quick start

```html
<script type="module" src="https://sahajatlas.com/auto.js?key=…"></script>
```

That is the whole snippet. **There is no element to add and no attribute to misspell** — the
script creates the widget where you put the tag, and every setting rides on the script URL's
query string.

Three things about it:

- **The file is `auto.js`.** It is a ~3 KiB loader, not the widget. It works out what your page
  supports, then fetches the widget itself only when the embed is about to come into view — so a
  widget further down your page costs your visitors almost nothing until they scroll to it.
- **Put it where the widget should appear**, in the body. The element is inserted immediately
  before the script tag. A snippet in `<head>` has nowhere to render and says so in the console.
- **Don't add `async` or `defer`.** The loader reads its own script tag to find both its settings
  and its position, and those attributes make the browser hide it.

`type="module"` is the normal form. If your platform will not let you set it — Wix's Custom
Element, some page builders — use [`embed.classic.js`](#platforms-that-cant-load-a-module)
instead, with the same query string.

Ask the Sahaj Atlas maintainers for an API key. It is a **public, published** key: it
ships in your page's HTML, it is scoped to read-only atlas data, and it is not a secret.

### If you previously used `<sahaj-atlas>` and attributes

The element and all nine attributes are gone. Everything moved onto the script URL, and the
reason is worth knowing, because it is about your platform rather than our taste: WordPress
strips `<script>` (and unknown attributes) from saved content for anyone below Administrator —
and for **every** Site Administrator on multisite — while Wix supplies a bare script URL and its
own attribute panel. One mechanism on the URL works identically on all of them, and the only
thing a sanitizer can now destroy is the whole snippet, which is a failure you can see.

```html
<!-- before -->
<script type="module" src="https://sahajatlas.com/embed.js"></script>
<sahaj-atlas api-key="…" map="false" locale="fr"></sahaj-atlas>

<!-- now -->
<script type="module" src="https://sahajatlas.com/auto.js?key=…&map=false&locale=fr"></script>
```

Note `api-key` became **`key`**. Every other name is unchanged.

## Where to load it from

Two hosts serve the identical bundle:

| Host                           | What it is                                             |
| ------------------------------ | ------------------------------------------------------ |
| `https://sahajatlas.com`       | the production domain — **use this one**               |
| `https://sahajatlas.pages.dev` | the Cloudflare Pages default host for the same project |

**The origin you load the script from is not the only origin the widget contacts, and
one of them is fixed regardless of your choice.** The bundle has the locale-JSON host
compiled into it: whichever host you fetch `auto.js` from, the widget's UI strings are
fetched from `https://sahajatlas.com/locales/…`. That matters only for your CSP, where
`connect-src` has to name it — see the table below. If those requests are blocked, every
string in the widget renders as its raw dotted key name (`events.title`, `nav.search`),
which looks like a broken translation rather than a blocked request.

That host is **compiled in from `VITE_HOST` at build time**, so it is a property of the
deployment rather than of the source — a local build carries whatever the checked-in `.env`
says. To confirm the current value rather than trusting this page, read it out of the
shipped bundle:

Three files sit at that origin's root, and only the first is one you reference:

| File               | What it is                                                          |
| ------------------ | ------------------------------------------------------------------- |
| `auto.js`          | the loader — the one you install                                    |
| `embed.js`         | the widget itself, fetched by the loader on demand                  |
| `embed.classic.js` | the non-module bridge, for platforms that can't set `type="module"` |

To confirm the locale origin rather than trusting this page, read it out of the shipped bundle:

```bash
curl -s https://sahajatlas.com/embed.js | grep -o 'assets/api-[^"]*\.js'
curl -s https://sahajatlas.com/assets/api-<hash>.js | grep -o 'https://[a-z.]*/locales/'
```

## Parameters

Twelve parameters on the script URL, all optional except `key`. Standard query-string rules
apply, so percent-encode anything with a space or an `&` in it (`name=Meditate%20Now`).

| Parameter         | Default                        | What it does                                                                                                                                                                                                                                |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`             | —                              | **Required.** Your published SahajCloud client key. Without a valid one the widget renders its configuration-error screen, and the loader logs an error naming the problem.                                                                 |
| `locale`          | the visitor's browser language | Force a UI language, e.g. `fr`. Full precedence: this parameter → the language on your client record → **`?locale=` on the page URL** → the browser's language → English.                                                                   |
| `map`             | `true`                         | `map=false` renders the atlas as lists and event pages with **no map canvas at all** — no Mapbox, no map token needed, and none of the Mapbox origins or storage below. Changes how you size the embed (see [Sizing](#sizing-the-element)). |
| `routing`         | `query`                        | Where the widget's route lives. `path` needs `mount` as well, and needs your server to serve the same page for everything under that prefix.                                                                                                |
| `mount`           | —                              | **`routing=path` only.** The path prefix the widget is served under, e.g. `/map`. Must be a site-relative path; anything else is refused and the widget falls back to query routing with a console warning.                                 |
| `base-path`       | `/`                            | The route the widget opens at, e.g. `/gb/london`. Must be site-relative. ⚠ Being retired — under query routing your own page URL carries `?atlas=/gb/london`, which does the same job.                                                     |
| `name`            | your client record's name      | Per-embed display name, used where the widget names itself.                                                                                                                                                                                 |
| `primary-color`   | your client record's colour    | Per-embed brand override, a hex colour. Percent-encode the `#` as `%23`.                                                                                                                                                                    |
| `secondary-color` | your client record's colour    | As above.                                                                                                                                                                                                                                   |
| `analytics`       | `true`                         | `analytics=false` never loads Fathom.                                                                                                                                                                                                       |
| `geolocation`     | `true`                         | `geolocation=false` never calls the IP-geolocation service.                                                                                                                                                                                 |
| `error-reporting` | `true`                         | `error-reporting=false` never sends a crash report.                                                                                                                                                                                         |
| `compact`         | `auto`                         | Whether the widget may fall back to a compact card in a slot too small for the full interface. `always` / `never` force it either way.                                                                                                      |

**The three privacy parameters and `map` share one spelling rule: only the exact values
`false` and `0` switch something off.** Anything else — the parameter absent, empty, `true`,
`no`, `FALSE` — leaves the feature **on**. This is deliberate, so that a typo can never silently
disable a flow you are relying on; but it also means `geolocation=no` does not do what it looks
like it does. The three privacy flags are described under
[Privacy](#privacy-storage-and-third-party-requests).

`compact` has three values rather than two, so it cannot follow that rule exactly — but it keeps
the important half: **an unrecognised value falls back to `auto`**, never to the setting that
would lock your embed into the small card. `true`/`1` and `false`/`0` are accepted as synonyms for
`always`/`never`.

```html
<script
  type="module"
  src="https://sahajatlas.com/auto.js?key=…&locale=fr&analytics=false&geolocation=false&error-reporting=false"
></script>
```

**One widget per page.** A second element is refused at connection time and never mounts, with a
note in the console. The API key and the theme root are page-global, so a second instance would
silently run on the first one's key and steal its theme. Loading the script twice is likewise a
no-op with a console note, not an exception in your page.

### Platforms that can't load a module

Some platforms give you a script URL and control the tag themselves, so you cannot add
`type="module"`. Wix's Custom Element is the common case.

Point them at **`embed.classic.js`** with the same query string:

```
https://sahajatlas.com/embed.classic.js?key=…
```

It is a few lines of plain JavaScript that loads the module loader for you, and everything after
that is identical. Where the platform also asks for a **tag name**, it is `sahaj-atlas` — the
loader will use the element that platform creates rather than making its own.

### What the loader reports back

On each load the widget notes a few things about the page it is on — whether it is top-level or
inside a frame, whether the URL can be written, and whether a query parameter survives your
router — and sends them to us **only when they have changed since last time**. In the steady state
that is zero requests.

It sends the page's **origin and path only**. Your query string and fragment are never included,
for the same reason they are stripped from crash reports: they can carry a reset token or an email
address. This is what tells us which of your pages can serve as the canonical atlas page for your
region, instead of us having to ask you and then keep the answer up to date by hand.

## Sizing the element

The two modes want opposite things from you, and neither is obvious from the markup.

**With the map (default), the widget takes the viewport.** The map canvas is rendered
`position: fixed; inset: 0`, so it fills the browser window and the drawers sit over it,
regardless of the size of the element the loader inserted. In practice this mode wants
a **full-page slot**: a dedicated page or a template with no surrounding content it could
cover. Putting it halfway down an article does not scale it into that space — it covers
the article.

**With `map=false`, you size it.** The widget fills its container (`height: 100%`), and
an unsized custom element is an inline box of zero height, so it collapses and appears not
to render:

The loader inserts the element for you, so size it with a rule rather than an inline style:

```html
<style>
  sahaj-atlas {
    display: block;
    height: 640px;
  }
</style>
<script type="module" src="https://sahajatlas.com/auto.js?key=…&map=false"></script>
```

Any way of giving it a height works — a CSS class, a grid or flex track, an aspect-ratio
box. `display:block` (or `flex`/`grid`) matters as much as the height: a custom element
defaults to `display: inline`.

**In `map=false` the widget adapts to your element, not to the browser window** (issue
#107). A 320px column on a large desktop screen gets the narrow layout — a bottom sheet
with a drag handle and swipe-to-dismiss — because the widget measures its own box. Resize
the element and it follows. Before this, layout keyed off the viewport, so a sidebar embed
on a wide screen was handed the desktop interaction model and had no drag handle to grab.

Touch affordances are the deliberate exception and follow the **device**, not the box: a
phone number is a `tel:` link on a touchscreen and a copyable number everywhere else,
however narrow the column. Whether a dial link reaches a dialer is hardware.

Map mode has no such adaptation, and that is a requirement rather than an oversight — the
drawers compute their travel from the window, so a map-mode widget confined to a small box
is broken by that arithmetic rather than merely cramped. **The widget now warns in the
console** when it detects that placement instead of leaving you to discover it.

## The URL, and your page's fragment

The widget routes off the URL fragment under the basename `!`, so a location inside it
looks like `#!/gb/london`. Two spellings are in play and **both are accepted on the way
in**:

| Spelling        | When you see it                                                                              |
| --------------- | -------------------------------------------------------------------------------------------- |
| `#/!/gb/london` | after any in-widget navigation — **the form your visitors will overwhelmingly see and copy** |
| `#!/gb/london`  | what the widget writes at boot, and the spelling `base-path` produces                        |

The router normalises the basename `!` to `/!` the moment the visitor clicks anything, so
the boot spelling is real but transient. Link to either; don't hand-build them from the
widget's internals.

**Mounting does not add a history entry.** The boot-time fragment write is a
`replaceState`, absolutised against the current location so that a `<base href>` on your
page can't redirect it. Your visitor's first Back press behaves normally.

### If your page already uses the fragment

Pages carrying their own anchor — `#respond`, `#comment-123`, a tab deep-link — are
routine, and the fragment is yours first. **When the widget finds a fragment that isn't
its own, it leaves the URL completely alone and routes in memory instead.** Your on-load
scroll still happens and anything of yours reading `location.hash` later still works.

The widget renders and behaves normally in that mode, with three consequences worth
stating plainly:

- **Its route is not in the address bar, so deep links out of the widget are not
  shareable from the URL bar on that page.** Where the widget offers a share link it
  offers the canonical atlas page instead, and where there honestly is no link it offers
  none rather than handing somebody your article's URL.
- Browser Back leaves your page rather than stepping back through the widget.
- In-widget link hrefs resolve against your origin, so a middle-click opens a URL on your
  site that probably 404s. A normal left-click is unaffected.

If a page is meant to be a linkable atlas page, keep its fragment free.

## Content-Security-Policy

If your page sends a CSP, this is what the widget needs added to it. **It is a list of
additions to your policy, not a policy** — your own sources still have to be in there.

```
script-src  https://sahajatlas.com https://api.mapbox.com https://challenges.cloudflare.com https://cdn.usefathom.com
worker-src  blob:
child-src   blob:
style-src   'unsafe-inline'
font-src    https://sahajatlas.com
img-src     data: https://api.mapbox.com https://imagedelivery.net https://cloud.sydevelopers.com https://react-circle-flags.pages.dev
connect-src https://sahajatlas.com https://cloud.sydevelopers.com https://api.mapbox.com https://events.mapbox.com https://ipwho.is https://challenges.cloudflare.com https://cdn.usefathom.com https://*.sentry.io
frame-src   https://challenges.cloudflare.com
```

**One line per directive, deliberately: CSP ignores every repeat of a directive name
after the first**, so splitting `script-src` across two lines silently drops the second
and leaves you believing you allowed something you hadn't. If you load the script from
`sahajatlas.pages.dev`, add that host too — but keep `https://sahajatlas.com` in
`connect-src` regardless, because the locale JSON comes from there either way.

### Why each one, and what breaks without it

| Directive                  | Source                                        | Why                                                                                                                                                                                                                                                    | Blocked ⇒                                                                                     |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `script-src`               | the widget's origin                           | The `<script>` tag fetches a small entry that pulls the rest of the bundle from the same origin, and the calendar, registration and share panels only when a viewer first opens them.                                                                  | nothing renders — or worse, it renders and then dies on one of those three presses            |
|                            | `api.mapbox.com`                              | Mapbox GL's right-to-left text plugin, loaded on demand from inside the map's worker the first time RTL text is encountered. Workers inherit the document's policy, so this lands on `script-src` rather than `worker-src`.                            | Arabic, Hebrew and Persian labels on the map render in the wrong order                        |
|                            | `challenges.cloudflare.com`                   | Turnstile, loaded lazily when a viewer opens the report-issue form                                                                                                                                                                                     | **degrades**: the form offers a `mailto:` address instead of a submit button                  |
|                            | `cdn.usefathom.com`                           | analytics, only on a build with an analytics ID and with `analytics=false` unset                                                                                                                                                                     | analytics only                                                                                |
| `worker-src` / `child-src` | `blob:`                                       | Mapbox GL compiles its worker bundle into a `Blob` and starts a module Worker from the resulting `blob:` URL. `child-src` is the fallback for engines predating `worker-src`.                                                                          | **the map fails**; the rest of the widget is unaffected                                       |
| `style-src`                | `'unsafe-inline'`                             | **The hard ask.** The widget has no stylesheet to link — it appends `<style>` elements at runtime, which carry no nonce.                                                                                                                               | the widget renders completely **unstyled**; it does not degrade                               |
| `font-src`                 | the widget's origin                           | The typeface is **self-hosted**. No request is made to `fonts.googleapis.com` or `fonts.gstatic.com`, so neither belongs in your policy and no visitor IP reaches a third party for a font.                                                            | text falls back to your system sans; everything works                                         |
| `img-src`                  | `data:`                                       | The map's pins and cluster bubbles are inline SVG rasterised from a `data:` URI — the widget ships them itself rather than relying on the map style's sprites.                                                                                         | **the map paints with no pins**                                                               |
|                            | `api.mapbox.com`                              | map tiles, sprites and glyphs                                                                                                                                                                                                                          | the map fails                                                                                 |
|                            | `imagedelivery.net`, `cloud.sydevelopers.com` | event and venue photography. The URL comes from the CMS, so the origin is data rather than something the bundle pins: today production serves the Cloudflare Images CDN (`imagedelivery.net`) and any relative URL is resolved against the API origin. | images only                                                                                   |
|                            | `react-circle-flags.pages.dev`                | country flag SVGs on the country list and the country-website offer. Sent with `referrer-policy: no-referrer`, so your page's URL is never disclosed.                                                                                                  | the flag glyphs only; the lists still render                                                  |
| `connect-src`              | `cloud.sydevelopers.com`                      | **the API — every event, region and venue.**                                                                                                                                                                                                           | **the widget has no data and shows an error screen**                                          |
|                            | `sahajatlas.com`                              | the locale JSON, from a different origin than the script                                                                                                                                                                                               | every string renders as its raw dotted key                                                    |
|                            | `api.mapbox.com`                              | tile/style requests and the place-search geocoder                                                                                                                                                                                                      | the map and search fail                                                                       |
|                            | `events.mapbox.com`                           | Mapbox GL's own map-load telemetry                                                                                                                                                                                                                     | nothing visible                                                                               |
|                            | `ipwho.is`                                    | the once-per-session IP→city lookup behind "classes near you"                                                                                                                                                                                          | **degrades**: the nearby suggestion and localized online times are skipped                    |
|                            | `challenges.cloudflare.com`                   | Turnstile's own verification calls                                                                                                                                                                                                                     | as `script-src` above                                                                         |
|                            | `cdn.usefathom.com`                           | analytics, conditional as above                                                                                                                                                                                                                        | analytics only                                                                                |
|                            | `*.sentry.io`                                 | crash reporting, contacted **only after the widget has already failed** and only on a build with a DSN                                                                                                                                                 | **degrades**: the widget notices the refusal and stops trying for the rest of the page's life |
| `frame-src`                | `challenges.cloudflare.com`                   | the Turnstile challenge iframe                                                                                                                                                                                                                         | as `script-src` above                                                                         |

Three notes on that table:

**`connect-src cloud.sydevelopers.com` is the entry most likely to be missing, and the
most expensive.** It was absent from every earlier version of this documentation. Without
it a strict-CSP host gets a widget that loads, styles itself, and then cannot fetch a
single event.

**The `*.sentry.io` wildcard is deliberately that wide.** A CSP host wildcard matches a
suffix only, and Sentry organisations created since 2024 get a _regional_ ingest host
(`o123.ingest.us.sentry.io`, `…de.sentry.io`) which `*.ingest.sentry.io` does **not**
match — a policy written that way looks correct and silently blocks everything. To name
one host instead, take the exact one from the DSN rather than deriving it. Leaving it out
is a supported choice: you get one blocked request and one violation report, not one per
error. `error-reporting=false` is the explicit way to say so.

**Five entries are load-bearing; the rest cost only the feature in their own row.** If you
allow nothing else, allow these — each one breaks the widget as a whole:

|                                      |                              |
| ------------------------------------ | ---------------------------- |
| `script-src` the widget's origin     | nothing renders              |
| `style-src 'unsafe-inline'`          | renders completely unstyled  |
| `connect-src cloud.sydevelopers.com` | no data at all               |
| `worker-src blob:`                   | the map never renders        |
| `img-src data:`                      | the map renders with no pins |

Everything else degrades to exactly what its "Blocked ⇒" column says — a missing typeface,
missing photography, missing flags, no analytics, no telemetry, a `mailto:` instead of the
report form. Read the row rather than assuming; over-allowing because a summary sounded
absolute is its own cost on a page that sends a strict policy.

Two entries are conditional on how the build is configured rather than on anything you
control: analytics is absent unless the deployed build carries an analytics ID, and Sentry
is absent unless it carries a DSN. Including them costs nothing if they are unused. And
one omission is deliberate: **`*.tiles.mapbox.com` is not in the list.** Older Mapbox
guidance names it, but this version routes every tile, glyph and sprite request through
`api.mapbox.com`, and there is no reference to the legacy host anywhere in the shipped
map library. Add it only if you see it in a violation report.

## Browser support

The bundle targets **Baseline Widely Available 2026-01-01**, which is the Vite 8 default
and is left there deliberately (the map already requires a modern browser):

| Browser        | Minimum |
| -------------- | ------- |
| Chrome / Edge  | 111     |
| Firefox        | 114     |
| Safari (macOS) | 16.4    |
| Safari (iOS)   | 16.4    |

Older browsers are not transpiled for and will fail on modern syntax rather than
degrading. There is no polyfill build.

## What the widget does to your page

**It will not restyle your page.** The stylesheet is injected into your document — there
is no shadow DOM — but every selector in it is confined to the widget's own subtree
(`.sy-atlas`) and every animation name is namespaced, enforced by a build-time check that
fails the build if a rule escapes. Your headings, links, lists, forms, `.container`, a
`.dark` theme class and your own Swiper or Mapbox instances are all left alone.

Two honest exceptions, neither one styling your content:

- Opening a modal panel inside the widget sets `overflow: hidden` on your `<body>` while
  it is open — standard scroll-lock, reverted on close.
- **`@font-face` is the one rule that cannot be scoped**, because it carries no selector.
  The widget registers three of them (one per character-set subset) for its self-hosted
  typeface, and they are document-global by nature. They are declared under the family
  name **`Sahaj Raleway`, deliberately not `Raleway`** — so if your page self-hosts
  Raleway itself, the widget's faces cannot override yours. That is the whole reason for
  the odd name. These three are the only `@font-face` rules the widget contributes;
  Mapbox and Swiper register none.

**The reverse direction is not guaranteed.** Aggressive global CSS on your page — a
blanket `button { … }` rule, say — can still reach _into_ the widget. A hard boundary
would need shadow DOM, which conflicts with the widget's portal and drawer architecture.
If the widget looks wrong on your site and right on ours, suspect your global CSS first.

### The style-tag ids

The widget appends its styles under two stable ids, kept stable across releases precisely
because host sites key off them:

| Id                  | Holds                                                |
| ------------------- | ---------------------------------------------------- |
| `sahaj-atlas-style` | the widget's stylesheet                              |
| `sahaj-atlas-fonts` | the `@font-face` blocks for the self-hosted typeface |

**`sahaj-atlas-style` is stable, but it is not unique.** The CSS is split alongside the
code, so the widget appends **more than one** element carrying that id over a session —
one at load, and one each when the calendar and the image lightbox are first opened (three
in the current build). `document.getElementById('sahaj-atlas-style')` returns only the
first. If you need them all, use `document.querySelectorAll('style#sahaj-atlas-style')`,
and expect the count to grow as a visitor opens more of the widget.

### Accessibility

The widget renders as a labelled `role="region"` landmark, so a screen-reader user can
jump to and out of it rather than meeting an unbounded run of content in the middle of
your page. It carries its own `lang` and `dir`, tracking the active locale — your page's
`<html lang>` is almost never the widget's.

## Privacy, storage and third-party requests

Everything the widget does happens in your visitor's browser, on your origin — so your
privacy notice, not ours, is the one that has to describe it. This is the summary; the
[README's privacy section](../README.md#privacy-storage-and-third-party-requests) carries
the full detail on each flow, including exactly what an error report does and does not
contain.

**It sets no cookies.** It stores four keys under your origin — two of its own, written
inside a `try`/`catch` so a sandboxed iframe degrades the setting rather than breaking the
widget, and two written by Mapbox GL:

| Key                                     | Store            | Holds                                                 | Lifetime            |
| --------------------------------------- | ---------------- | ----------------------------------------------------- | ------------------- |
| `theme`                                 | `localStorage`   | the viewer's light/dark/auto choice                   | until cleared       |
| `sahajAtlas.geolocationPromptDismissed` | `sessionStorage` | that they dismissed the "classes near you" suggestion | the browser session |
| `mapbox.eventData:<token>`              | `localStorage`   | Mapbox GL's own telemetry bookkeeping                 | until cleared       |
| `mapbox.eventData.uuid:<token>`         | `localStorage`   | a persistent anonymous id Mapbox generates            | until cleared       |

The `theme` key is **not namespaced**: if your page stores its own `theme` preference
under that name, the widget will read and overwrite it. The two `mapbox.*` keys appear
only when the map renders, so `map=false` removes them.

The language picker persists **nothing** — i18next's detector would cache `i18nextLng` on
your origin by default and that write is switched off.

Three third-party flows leave the browser, and each has a parameter that turns it off:

- **`ipwho.is`** — a keyless IP→city lookup, once per session, so the widget can offer
  "classes near you" before the visitor types and show an online class's start time in
  their own place. No referrer, no key, no cookies, five-second timeout, silent on
  failure, and skipped entirely when neither feature could show. **An IP is personal data
  in the EU** — if your privacy notice can't cover it, set `geolocation=false`.
- **`cdn.usefathom.com`** — cookieless, aggregate pageview counting, loaded only when the
  bundle was built with an analytics ID, your client record names a real primary domain,
  and you have not set `analytics=false`. Auto-tracking is off, so it reports the
  widget's own route under that domain — **your page's real URL and query string are never
  sent**.
- **`*.sentry.io`** — crash reports, sent only when the widget has already broken and only
  on a build with a DSN. Your page reaches it **as origin and path only, never its query
  string or fragment**, which on your site can carry a reset token or an OAuth
  `#access_token`. It also carries the visitor's **`navigator.userAgent`**. No global error
  handler is installed, so your own scripts' exceptions are never captured; no breadcrumbs,
  no session replay. `error-reporting=false` stops it entirely.

**`map=false` removes the Mapbox flows too** — tiles, the geocoder (which sends the
visitor's typed query and the map centre to Mapbox), and the map-load telemetry — along
with the two `mapbox.*` storage keys. That is the only switch for them; they are Mapbox's
own behaviour, not ours.

Two things a visitor can send us on purpose, both on submit and never in the background: a
**class registration** (their name, email and any organiser questions) and a **report
about an issue** (their message, and the page they were on with its query string and
fragment stripped). Both go over HTTPS to SahajCloud; neither is stored in the browser.

## Updates and caching

**The embed is evergreen and there is no version to pin.** `auto.js` is served unhashed
from our origin and updated in place, roughly daily; every host serves the current build.
[`CHANGELOG.md`](../CHANGELOG.md) is written for embedding sites and records what you can
observe — parameters, origins, CSP, visible behaviour.

Two consequences:

- **Don't cache `auto.js` or `embed.js` aggressively at your edge.** They import content-hashed chunks
  by name. A stale copy held by a proxy or service worker will ask for chunk filenames the
  CDN no longer serves, and those 404s kill the widget with no fallback. Let it revalidate.
  The hashed chunks underneath it are immutable and safe to cache hard.
- Because there is no pinning, a breaking change is a change you receive. The changelog is
  the channel; if you need advance notice for a large deployment, say so to the
  maintainers rather than pinning a URL.

## Troubleshooting

| Symptom                                                               | Likely cause                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nothing renders; a 404 for the script**                             | The filename is `auto.js` (or `embed.classic.js`). `embed.js` exists but is the widget the loader fetches, not the file you install.                                                                                                                                                                            |
| **"Not set up correctly" / configuration error**                      | The parameter is `key`, not `api-key` — it was renamed when configuration moved onto the script URL. The loader logs an error naming it. Otherwise the key itself is wrong, revoked, or not yet issued.                                                                                                         |
| **Nothing renders, no console error, script loaded fine**             | `map=false` with no height on the element — it collapsed to zero. Give it `display:block;height:…`.                                                                                                                                                                                                           |
| **The console says `<sahaj-atlas>` is already defined**               | The embed script is on the page twice, under **two different URLs** — identical `<script src>` tags are deduped by the module map, so this fires on the `sahajatlas.com` vs `pages.dev` mismatch. The widget renders normally; the second copy is a no-op. Worth tidying, but it is not why anything is broken. |
| **A second widget on the page is blank**                              | Only one `<sahaj-atlas>` runs per page, by design; the console says so.                                                                                                                                                                                                                                         |
| **The widget renders completely unstyled**                            | `style-src 'unsafe-inline'` is missing from your CSP.                                                                                                                                                                                                                                                           |
| **Every label reads like `events.title`**                             | The locale JSON is blocked — add `https://sahajatlas.com` to `connect-src`. It is a different origin from the script even when you load the script from `pages.dev`.                                                                                                                                            |
| **Widget loads and styles, but shows an error instead of any events** | `connect-src https://cloud.sydevelopers.com` is missing.                                                                                                                                                                                                                                                        |
| **The map area is blank or grey**                                     | `worker-src blob:` (Mapbox starts its worker from a `blob:` URL), or `api.mapbox.com` missing from `img-src`/`connect-src`.                                                                                                                                                                                     |
| **The map renders but has no pins**                                   | `img-src data:` — the pins are inline SVG rasterised from a `data:` URI.                                                                                                                                                                                                                                        |
| **Country flags are missing, everything else fine**                   | `img-src https://react-circle-flags.pages.dev`. Cosmetic.                                                                                                                                                                                                                                                       |
| **The report form shows a `mailto:` link instead of a submit button** | Turnstile is blocked — `script-src`/`frame-src`/`connect-src challenges.cloudflare.com`. This is the intended degradation.                                                                                                                                                                                      |
| **The widget's route never appears in the address bar**               | The page loaded with its own `#anchor`, so the widget is routing in memory and deliberately not writing to the URL. Free the fragment if the page should be linkable.                                                                                                                                           |
| **Sharing offers no link**                                            | The same memory-routing mode, on a page with no canonical atlas URL to offer instead.                                                                                                                                                                                                                           |
| **The widget covers the rest of the page**                            | Map mode renders `position: fixed; inset: 0` and wants a full-page slot. Use `map=false` for an in-page embed.                                                                                                                                                                                                |
| **The widget looks wrong on your site only**                          | Your global CSS is reaching into it. The widget scopes its own styles out of your page, but has no shadow DOM to keep yours out of it.                                                                                                                                                                          |
| **It broke after working yesterday**                                  | The embed updates in place — check [`CHANGELOG.md`](../CHANGELOG.md), then look for a cached `auto.js` or `embed.js` at your edge requesting chunk names that no longer exist.                                                                                                                                  |
| **Console: "could not find a place to render"**                       | The snippet is in `<head>`, or carries `async`/`defer`. Move it into the body without those attributes, or add an empty `<sahaj-atlas></sahaj-atlas>` where the widget should appear.                                                                                                                           |
| **Console: "no `key` parameter on the embed script URL"**             | The query string is missing or was stripped. Some page builders drop everything after `?` from a script URL — if so, the platform needs the `embed.classic.js` route or a plugin.                                                                                                                               |
| **The widget only appears when you scroll to it**                     | Intended. The loader defers fetching the widget until the embed is near the viewport, so a widget below the fold costs your visitors nothing until they reach it.                                                                                                                                               |

If none of these fit, the widget's own **Report an issue** form (behind the settings
control, and offered on most error screens) reaches the maintainers with the failure
already attached.
