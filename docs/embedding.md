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
- [The URL](#the-url)
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

`type="module"` is required — the loader is an ES module.

Ask the Sahaj Atlas maintainers for an API key. It is a **public, published** key: it
ships in your page's HTML, it is scoped to read-only atlas data, and it is not a secret.

### If you previously used `<sahaj-atlas>` and attributes

The element and all nine attributes are gone. Most became query parameters; the rest moved to
your client record or were removed (see [Parameters](#parameters)). The reason is worth knowing,
because it is about your platform rather than our taste: WordPress
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

Three things to check when you migrate:

- `api-key` became **`key`**.
- `base-path` became **`atlas`**, and now defers to a route already on the page's URL.
- `analytics`, `geolocation`, `error-reporting`, `name`, `primary-color`, `secondary-color` and
  `mount` no longer exist. A leftover value in your URL is ignored rather than misread.

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

Two files sit at that origin's root, and only the first is one you reference:

| File       | What it is                                         |
| ---------- | -------------------------------------------------- |
| `auto.js`  | the loader — the one you install                   |
| `embed.js` | the widget itself, fetched by the loader on demand |

To confirm the locale origin rather than trusting this page, read it out of the shipped bundle:

```bash
curl -s https://sahajatlas.com/embed.js | grep -o 'assets/api-[^"]*\.js'
curl -s https://sahajatlas.com/assets/api-<hash>.js | grep -o 'https://[a-z.]*/locales/'
```

## Parameters

Six parameters on the script URL, all optional except `key`. Standard query-string rules apply,
so percent-encode anything with a reserved character in it (`atlas=%2Fgb%2Flondon` is equivalent
to `atlas=/gb/london`; both work).

| Parameter | Default                        | What it does                                                                                                                                                                                                                         |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `key`     | —                              | **Required.** Your published SahajCloud client key. Without a valid one the widget renders its configuration-error screen, and the loader logs an error naming the problem.                                                          |
| `locale`  | the visitor's browser language | Force a UI language, e.g. `fr`. Full precedence: this parameter → the language on your client record → **`?locale=` on the page URL** → the browser's language → English.                                                            |
| `map`     | `true`                         | `map=false` renders the atlas as lists and event pages with **no map canvas at all** — no Mapbox, no map token needed, and none of the Mapbox origins or storage below. Changes how you size it (see [Sizing](#sizing-the-element)). |
| `routing` | `query`                        | Where the widget's route lives. `path` additionally needs your server to serve the same page for everything under the atlas prefix, and that prefix comes from your client record rather than from here.                             |
| `atlas`   | —                              | The route to open at when the page's own URL does not already name one, e.g. `/gb/london`. Must be site-relative.                                                                                                                    |
| `compact` | `auto`                         | Whether the widget may fall back to a compact card in a slot too small for the full interface. `always` / `never` force it either way. See [Sizing](#when-the-slot-is-too-small).                                                    |

**`map` follows one spelling rule: only the exact values `false` and `0` switch it off.**
Anything else — the parameter absent, empty, `true`, `no`, `FALSE` — leaves it **on**. This is
deliberate, so that a typo can never silently disable something you are relying on; but it also
means `map=no` does not do what it looks like it does.

`compact` has three values rather than two, so it cannot follow that rule exactly — but it keeps
the important half: **an unrecognised value falls back to `auto`**, never to the setting that
would lock your embed into the small card. `true`/`1` and `false`/`0` are accepted as synonyms for
`always`/`never`.

### `atlas`, and how the route is chosen

`atlas` is a **default, not an override**. A route already on the page's own URL always wins:

```
your-page?atlas=/nl/amsterdam   +   auto.js?atlas=/gb/london   →   opens /nl/amsterdam
your-page                       +   auto.js?atlas=/gb/london   →   opens /gb/london
```

That ordering is the point. A visitor arriving with `?atlas=` in the URL deep-linked, navigated,
or followed a link somebody shared, and sending them to your default instead would throw away
where they asked to be. Use `atlas` for an embed that should always open somewhere specific — a
page dedicated to one city, or an event's registration form.

### What you configure in the CMS instead

Some things are **not** parameters, on purpose:

| Setting                            | Where it lives                                                         |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Display name, brand colours        | your client record                                                     |
| The path prefix for `routing=path` | your client record — the same value your canonical URLs are built from |

Identity is the same on every page you embed on, so making it per-embed only creates the
opportunity for two of your pages to disagree about what the product is called. The routing prefix
is worse than merely redundant: it is the value we compose your canonical URLs from, so a second
copy on a script tag could disagree with the one the canonical was built from — and a canonical
pointing at a URL that does not restore the view is precisely the failure canonical URLs exist to
prevent.

**There are also no privacy opt-outs**, and the flows they used to switch off are described under
[Privacy](#privacy-storage-and-third-party-requests): analytics is cookieless and aggregate, crash
reports carry no cookies or session replay and reduce your page to origin and path, and the
location lookup is a keyless once-per-session city lookup. If a flow is nevertheless a problem for
your privacy notice, talk to the maintainers — the answer is a setting on your client record, not
something an editor can change by editing a script tag.

```html
<script type="module" src="https://sahajatlas.com/auto.js?key=…&locale=fr&map=false"></script>
```

**One widget per page.** The loader marks the element it takes charge of, so a second copy of the
snippet renders nothing and says so in the console rather than silently adopting the first one's
widget and discarding its own settings. This is a real constraint rather than an oversight: two
widgets would both write the same `?atlas=` parameter and fight over it every time either one
navigated.

### What the loader reports back

On each load the widget notes a few things about the page it is on — whether it is top-level or
inside a frame, whether the URL can be written, and whether a query parameter survives your
router — and sends them to `POST /api/clients/report` once the widget has actually rendered.

It sends the page's **origin and path only**, as two separate fields. Your query string and
fragment are never included, for the same reason they are stripped from crash reports: they can
carry a reset token or an email address. This is what tells us which of your pages can serve as the
canonical atlas page for your region, instead of us having to ask you and then keep the answer up
to date by hand.

**One query parameter is the exception: `?p=<number>`.** WordPress sites on default permalinks
address every page that way, so discarding it would report every post on the site as the same page
and leave you unable to nominate one. A post id is not something your visitor typed. Anything else
in the query is still dropped, including `?p=123&utm_source=…` — a permalink with anything
appended is discarded whole rather than trimmed.

It reports on **every load**, not only when something changed. That is what makes "last seen" mean
anything: an embed that reported once and then went quiet is indistinguishable from one that was
removed. Repeat reports of an unchanged page are collapsed server-side into at most one write an
hour, so this is one small request per page view, and nothing your visitor sees depends on it.

Two things can refuse it, and both are configuration rather than a fault in your page — they are
reported to the browser console and the widget carries on working:

| Console message mentions     | What it means                                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the origin is not allowed    | your domain is not on the service's allowed-domains list in the CMS. Unlike the read endpoints, an **empty** list refuses here rather than allowing everything |
| the maximum number of mounts | the service already tracks 50 distinct pages. Pages already known keep reporting                                                                               |

### The readiness marker

Once the widget has genuinely mounted, it sets one attribute on your page's `<html>` element:

```html
<html data-sahaj-atlas-ready='{"v":2,"routing":"query","topLevel":true,"urlWritable":true}'></html>
```

It is written **after** the widget renders, never on script load, and removed again if the widget
is unmounted. It exists so that our CMS can load your page and confirm for itself that the embed
works before treating it as your region's canonical page — a claim the widget makes about itself is
not evidence. Nothing on your page needs to read it, and nothing of yours is described by it.

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
is broken by that arithmetic rather than merely cramped. **The widget warns in the
console** when it detects that placement instead of leaving you to discover it.

### When the slot is too small

Below a certain size there is no layout that works, so the widget stops trying to fit one in
and shows a **compact card** instead: a button that opens the whole interface in a full-screen
overlay, with a couple of upcoming classes above it when there is room. Your visitor still gets
everything; it just does not try to live in a 300-pixel box.

**The card takes only the room it needs.** The button is the part that always renders; the
preview classes appear only when your box has spare height above it, and the content is centred
both ways inside whatever box you gave. If you gave the element **no height at all**, the card
sizes to its own content rather than collapsing — so a bare `<sahaj-atlas>` in a narrow column
renders as a card in your page's flow instead of appearing not to render. A card showing no
preview rows also makes **no data requests at all**, including the IP lookup.

The floors are **360px wide and 420px tall**. The width is measured on the element itself, or
on the column it sits in when the element has no box of its own; the height is only ever read
from the element, so **an element you have given no height is never called too short** — only
too narrow, and it then sizes to the card's own content as above. A slot that is essentially the whole screen is never called too small either,
because there would be nothing bigger to expand into: a full-width embed on a phone keeps the
normal interface.

| `compact`        | What happens                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `auto` (default) | Measured. Below either floor, the compact card; otherwise the full interface.                                          |
| `always`         | Always the compact card, whatever the slot measures.                                                                   |
| `never`          | Always the full interface. In a slot that does not fit it will be cramped, and the widget says so in the console once. |

Four things worth knowing:

- **It is decided once, when the widget mounts.** Resizing your page afterwards does not switch
  between the two, because switching would remount the widget and throw away where the visitor
  had navigated to. If your layout can be either size, pick the one you want with `always` or
  `never`.
- **Entering the compact card logs a console warning** naming the size measured and the size
  needed, so a slot you did not mean to make small is findable rather than mysterious.
- **The overlay locks your page's scroll while it is open**, and restores it on close. It is a
  modal dialog, so while it is open the rest of your page is also marked `aria-hidden` — a
  screen reader reads the widget rather than the page underneath it — and that is undone on
  close too. **Escape works**, and it steps outward: it dismisses whatever the widget has open
  first, and closes the overlay once there is nothing left inside. The × in the corner always
  closes it too, and focus returns to the button that opened it. If the overlay ever finds
  itself unable to cover the page, it closes itself rather than leaving a visitor stuck on a
  page they cannot scroll.
- **A deep link opens the card, not the route.** `?atlas=/gb/london` on a page whose embed is
  compact still shows the card first; the route is waiting behind the button and the overlay
  opens straight onto it. That is deliberate — a full-screen overlay appearing on page load,
  over your content, with nobody having asked for it, is worse than one press.
- ⚠ **Do not put the embed inside an element with `transform`, `filter` or `contain`.** Those
  make that element the containing block for fixed-position content, so the overlay is confined
  to it instead of covering the page — and the same already applies to the map, which is fixed
  too. The widget warns in the console when it finds one. (`container-type` is fine; it does not
  have this effect, however often it is said to.)

## The URL

**The widget's route lives in a query parameter on your own page's URL:**

```
https://your-site.example/classes?atlas=/gb/london
```

That is the URL your visitors see, copy and share, and — the point of the whole thing — the URL a
search engine can index. Every event and every city is a distinct URL on **your** domain.

Three consequences worth stating plainly:

- **Your other query parameters survive.** We set and read exactly one, `atlas`, and leave the rest
  alone. WordPress's `/?p=123` permalinks keep working.
- **Your page's `#anchor` is none of our business.** The widget never reads or writes the fragment.
  A page that loads at `#respond` scrolls where you expect, anything of yours reading
  `location.hash` still works, and the widget routes normally alongside it. (Before this, the widget
  routed off the fragment and had to guess whether it or you owned it.)
- **In-widget links are real links.** Middle-click, "copy link address" and open-in-new-tab all give
  somebody a working URL on your site, because every href the widget renders is absolute and on your
  origin.

**Mounting does not add a history entry, and does not touch your URL at all.** The widget only
writes the parameter once a visitor navigates inside it. If you want an embed to open somewhere
specific, use the [`atlas` parameter](#atlas-and-how-the-route-is-chosen) — it is the default the
widget starts at when your page's URL names no route.

### If the parameter name collides

`atlas` is not a WordPress reserved query var and does not collide with anything we know of. If it
collides with something on your site, tell the maintainers — the name is a single constant, not
something each embed sets, so the fix is on our side.

### When the route is not in the URL

In a sandboxed iframe, or a `file://` document, the browser refuses to let us write the URL at all.
The widget detects that at load and routes **in memory** instead: it works normally, but its route
is not in the address bar, so it cannot be deep-linked from that page, and browser Back leaves your
page rather than stepping back through the widget. Where the widget would offer a share link it
offers the event's canonical page instead, and where there honestly is no link it offers none rather
than handing somebody your page's URL.

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
|                            | `cdn.usefathom.com`                           | analytics, only on a build with an analytics ID                                                                                                                                                                                                        | analytics only                                                                                |
| `worker-src` / `child-src` | `blob:`                                       | Mapbox GL compiles its worker bundle into a `Blob` and starts a module Worker from the resulting `blob:` URL. `child-src` is the fallback for engines predating `worker-src`.                                                                          | **the map fails**; the rest of the widget is unaffected                                       |
| `style-src`                | `'unsafe-inline'`                             | **The hard ask.** The widget has no stylesheet to link — it appends `<style>` elements at runtime, which carry no nonce.                                                                                                                               | the widget renders completely **unstyled**; it does not degrade                               |
| `font-src`                 | the widget's origin                           | The typeface is **self-hosted**. No request is made to `fonts.googleapis.com` or `fonts.gstatic.com`, so neither belongs in your policy and no visitor IP reaches a third party for a font.                                                            | text falls back to your system sans; everything works                                         |
| `img-src`                  | `data:`                                       | The map's pins and cluster bubbles are inline SVG rasterised from a `data:` URI — the widget ships them itself rather than relying on the map style's sprites.                                                                                         | **the map paints with no pins**                                                               |
|                            | `api.mapbox.com`                              | map tiles, sprites and glyphs                                                                                                                                                                                                                          | the map fails                                                                                 |
|                            | `imagedelivery.net`, `cloud.sydevelopers.com` | event and venue photography. The URL comes from the CMS, so the origin is data rather than something the bundle pins: today production serves the Cloudflare Images CDN (`imagedelivery.net`) and any relative URL is resolved against the API origin. | images only                                                                                   |
|                            | `react-circle-flags.pages.dev`                | country flag SVGs on the country list and the country-website offer. Sent with `referrer-policy: no-referrer`, so your page's URL is never disclosed.                                                                                                  | the flag glyphs only; the lists still render                                                  |
| `connect-src`              | `cloud.sydevelopers.com`                      | **the API — every event, region and venue**, plus the one-per-load [embed report](#what-the-loader-reports-back). Same origin, so no addition is needed for it.                                                                                        | **the widget has no data and shows an error screen**                                          |
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
error, and the widget latches off after the first refusal rather than retrying per error.

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

Three honest exceptions, none of them styling your content:

- Opening a modal panel inside the widget sets `overflow: hidden` on your `<body>` while
  it is open — standard scroll-lock, reverted on close.
- It sets one attribute, `data-sahaj-atlas-ready`, on your `<html>` element once it has
  mounted, and removes it again if it unmounts. See
  [the readiness marker](#the-readiness-marker) for what it is for. No styling, no classes,
  and nothing else of yours is touched.
- **`@font-face` is the one rule that cannot be scoped**, because it carries no selector.
  The widget registers three of them (one per character-set subset) for its self-hosted
  typeface, and they are document-global by nature. They are declared under the family
  name **`Atlas Raleway`, deliberately not `Raleway`** — so if your page self-hosts
  Raleway itself, the widget's faces cannot override yours. That is the whole reason for
  the odd name. These three are the only `@font-face` rules the widget contributes;
  Mapbox and Swiper register none.

**The reverse direction is now defended, with one documented exception.** The widget resets its
own subtree before applying its styles, so aggressive global CSS on your page — a blanket
`button { … }`, an `a { color: … }`, a global `letter-spacing` — no longer reaches into it.

**The exception is `!important`.** A rule like `div { font-family: … !important }` on your page
still wins, because an important declaration beats a non-important one whatever its specificity,
and the only way for us to outrank it would be to use `!important` ourselves — which would beat our
own styles too and leave the widget unstyled. If the widget looks wrong on your site and right on
ours, look for `!important` in your global CSS first.

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

| Key                                | Store            | Holds                                                 | Lifetime            |
| ---------------------------------- | ---------------- | ----------------------------------------------------- | ------------------- |
| `atlas.theme`                      | `localStorage`   | the viewer's light/dark/auto choice                   | until cleared       |
| `atlas.geolocationPromptDismissed` | `sessionStorage` | that they dismissed the "classes near you" suggestion | the browser session |
| `mapbox.eventData:<token>`         | `localStorage`   | Mapbox GL's own telemetry bookkeeping                 | until cleared       |
| `mapbox.eventData.uuid:<token>`    | `localStorage`   | a persistent anonymous id Mapbox generates            | until cleared       |

**The `theme` key used to be un-namespaced** — the bare string `theme` — so a page storing its own
light/dark preference under that name had it read and overwritten. That is fixed: our key is now
`atlas.theme`, and the old one is read once (never written) so nobody loses a choice they already
made. The two `mapbox.*` keys appear only when the map renders, so `map=false` removes them.

The language picker persists **nothing** — i18next's detector would cache `i18nextLng` on
your origin by default and that write is switched off.

Three third-party flows leave the browser. **None of them has a script-URL opt-out** — each is
designed so that it does not need one, and if a flow is still a problem for your privacy notice,
talk to the maintainers rather than editing the snippet:

- **`ipwho.is`** — a keyless IP→city lookup, once per session, so the widget can offer
  "classes near you" before the visitor types, show an online class's start time in their
  own place, and rank the classes on the compact card by distance rather than by date. No
  referrer, no key, no cookies, five-second timeout, silent on failure, and skipped entirely
  when none of those could show — including for the rest of a session in which the visitor
  dismissed the "classes near you" prompt. **An IP is personal data
  in the EU**, and it is not stored — the answer is used to pick a city and then discarded.
- **`cdn.usefathom.com`** — cookieless, aggregate pageview counting, loaded only when the
  bundle was built with an analytics ID and your client record names a real primary
  domain. Auto-tracking is off, so it reports the
  widget's own route under that domain — **your page's real URL and query string are never
  sent**.
- **`*.sentry.io`** — crash reports, sent only when the widget has already broken and only
  on a build with a DSN. Your page reaches it **as origin and path only, never its query
  string or fragment**, which on your site can carry a reset token or an OAuth
  `#access_token`. It also carries the visitor's **`navigator.userAgent`**. No global error
  handler is installed, so your own scripts' exceptions are never captured; no breadcrumbs,
  no session replay.

**`map=false` removes the Mapbox flows too** — tiles, the geocoder (which sends the
visitor's typed query and the map centre to Mapbox), and the map-load telemetry — along
with the two `mapbox.*` storage keys. That is the only switch for them; they are Mapbox's
own behaviour, not ours.

Two things a visitor can send us on purpose, both on submit and never in the background: a
**class registration** (their name, email and any organiser questions) and a **report
about an issue** (their message, and the page they were on with its query string and
fragment stripped). Both go over HTTPS to SahajCloud; neither is stored in the browser.

One thing the widget itself sends in the background, about your page rather than your visitor:
the **embed report** described under [what the loader reports back](#what-the-loader-reports-back)
— your origin and path, and four booleans about how the widget is mounted. Its _body_ carries
nothing about the visitor: no identifier, no location, and none of your query string bar a
WordPress `?p=<number>`. Like any request a browser makes it still carries the visitor's IP and
`User-Agent` as headers, which no client-side code can suppress — the distinction worth drawing is
against the crash reports above, which put the user agent in the payload deliberately.

## Updates and caching

**The embed is evergreen and there is no version to pin.** `auto.js` is served unhashed
from our origin and updated in place, roughly daily; every host serves the current build.
[`CHANGELOG.md`](../CHANGELOG.md) is written for embedding sites and records what you can
observe — parameters, origins, CSP, visible behaviour.

Two consequences:

**We serve both root files with `Cache-Control: public, max-age=0, must-revalidate`**, so a
browser always asks before reusing one. That is deliberate and it is the contract: the files are
unhashed and mutable, and they import content-hashed chunks by name.

- **Don't cache `auto.js` or `embed.js` aggressively at your edge.** They import content-hashed chunks
  by name. A stale copy held by a proxy or service worker will ask for chunk filenames the
  CDN no longer serves, and those 404s kill the widget with no fallback. Let it revalidate.
  The hashed chunks underneath it are immutable and safe to cache hard.
- Because there is no pinning, a breaking change is a change you receive. The changelog is
  the channel; if you need advance notice for a large deployment, say so to the
  maintainers rather than pinning a URL.

## Troubleshooting

| Symptom                                                               | Likely cause                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nothing renders; a 404 for the script**                             | The filename is `auto.js`. `embed.js` exists but is the widget the loader fetches, not the file you install.                                                                                            |
| **"Not set up correctly" / configuration error**                      | The parameter is `key`, not `api-key` — it was renamed when configuration moved onto the script URL. The loader logs an error naming it. Otherwise the key itself is wrong, revoked, or not yet issued. |
| **Nothing renders, no console error, script loaded fine**             | `map=false` with no height on the element — it collapsed to zero. Give it `display:block;height:…`.                                                                                                     |
| **Console: "the embed script is on this page more than once"**        | Exactly that. Only one widget runs per page, so the second copy renders nothing and its settings are ignored. Remove the extra script tag.                                                              |
| **The widget renders completely unstyled**                            | `style-src 'unsafe-inline'` is missing from your CSP.                                                                                                                                                   |
| **Every label reads like `events.title`**                             | The locale JSON is blocked — add `https://sahajatlas.com` to `connect-src`. It is a different origin from the script even when you load the script from `pages.dev`.                                    |
| **Widget loads and styles, but shows an error instead of any events** | `connect-src https://cloud.sydevelopers.com` is missing.                                                                                                                                                |
| **The map area is blank or grey**                                     | `worker-src blob:` (Mapbox starts its worker from a `blob:` URL), or `api.mapbox.com` missing from `img-src`/`connect-src`.                                                                             |
| **The map renders but has no pins**                                   | `img-src data:` — the pins are inline SVG rasterised from a `data:` URI.                                                                                                                                |
| **Country flags are missing, everything else fine**                   | `img-src https://react-circle-flags.pages.dev`. Cosmetic.                                                                                                                                               |
| **The report form shows a `mailto:` link instead of a submit button** | Turnstile is blocked — `script-src`/`frame-src`/`connect-src challenges.cloudflare.com`. This is the intended degradation.                                                                              |
| **The widget's route never appears in the address bar**               | The document refuses `history.replaceState` — a sandboxed iframe, or `file://`. The widget detects that and routes in memory; add `allow-same-origin` to the sandbox if you control it.                 |
| **`atlas=` on the script URL seems to be ignored**                    | The page's own URL already carries an `?atlas=` route, which always wins. That is intended — see [`atlas`, and how the route is chosen](#atlas-and-how-the-route-is-chosen).                            |
| **Sharing offers no link**                                            | The same memory-routing mode, on a page with no canonical atlas URL to offer instead.                                                                                                                   |
| **The widget covers the rest of the page**                            | Map mode renders `position: fixed; inset: 0` and wants a full-page slot. Use `map=false` for an in-page embed.                                                                                          |
| **The widget looks wrong on your site only**                          | Your global CSS is reaching into it. The widget scopes its own styles out of your page, but has no shadow DOM to keep yours out of it.                                                                  |
| **It broke after working yesterday**                                  | The embed updates in place — check [`CHANGELOG.md`](../CHANGELOG.md), then look for a cached `auto.js` or `embed.js` at your edge requesting chunk names that no longer exist.                          |
| **Console: "could not find a place to render"**                       | The snippet is in `<head>`, or carries `async`/`defer`. Move it into the body without those attributes, or add an empty `<sahaj-atlas></sahaj-atlas>` where the widget should appear.                   |
| **Console: "no `key` parameter on the embed script URL"**             | The query string is missing or was stripped. Some page builders drop everything after `?` from a script URL — if so, that platform cannot host the widget this way; talk to the maintainers.            |
| **The widget only appears when you scroll to it**                     | Intended. The loader defers fetching the widget until the embed is near the viewport, so a widget below the fold costs your visitors nothing until they reach it.                                       |

If none of these fit, the widget's own **Report an issue** form (behind the settings
control, and offered on most error screens) reaches the maintainers with the failure
already attached.
