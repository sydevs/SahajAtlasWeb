# Embedding Sahaj Atlas

**Copy one of [the two embed codes](#the-two-embed-codes) below and you are done.** Everything
after them is optional: parameters, sizing, the Content-Security-Policy contract, what the widget
touches on your page, what leaves your visitor's browser, and what to check when something looks
wrong.

This is the host-facing reference. [`AGENTS.md`](../AGENTS.md) is the developer guide.
[`CHANGELOG.md`](../CHANGELOG.md) records what changes under an embed that updates itself.

## The two embed codes

**There are exactly two ways to embed the atlas, and both are one copy-paste.** Pick by whether
your platform lets you add a `<script>` tag to a page's body.

### 1. Script — the primary embed

```html
<script type="module" src="https://sahajatlas.com/auto.js?key=YOUR_KEY"></script>
```

That is the whole snippet. Put it in the body where the widget should appear — it renders
full-screen over your page, which is what the atlas wants when it has a page to itself.

**For an embed that stays inside your layout**, add `map=false` and give it a height:

```html
<style>
  sahaj-atlas {
    display: block;
    height: 640px;
  }
</style>
<script type="module" src="https://sahajatlas.com/auto.js?key=YOUR_KEY&map=false"></script>
```

### 2. Iframe — when you cannot add a script

```html
<iframe
  src="https://sahajatlas.com/?key=YOUR_KEY&map=false"
  title="Find a meditation class near you"
  width="100%"
  height="640"
  loading="lazy"
  allow="geolocation; clipboard-write; web-share"
  style="border: 0"
></iframe>
```

Use this on platforms that strip `<script>` from saved content — most WordPress roles below
Administrator, and some page builders. It is a complete embed: everything below is optional.

### Which one, and what you give up

|                                                                          | Script            | Iframe          |
| ------------------------------------------------------------------------ | ----------------- | --------------- |
| Works where `<script>` is stripped                                       | no                | **yes**         |
| The route appears in **your** page's URL, and is shareable and indexable | **yes**           | no              |
| Grows out of a small slot when it needs room                             | **yes**, in place | opens a new tab |
| Costs before a visitor scrolls to it                                     | ~3 KiB            | the whole page  |

**Prefer the script.** The iframe cannot put the widget's route on your URL, which is the whole
mechanism by which each city and event becomes a page search engines can index on your domain.

### Both snippets, spelled out

Everything either snippet needs is in it. Specifically:

- **`key` is the only required setting** and is the same for both. Ask the Sahaj Atlas
  maintainers for one. It is **public and published** — it ships in your page's HTML, it is
  scoped to read-only atlas data, and it is not a secret.
- **Every other setting rides on that URL's query string** — see [Parameters](#parameters).
  There is no element to add and no attribute to misspell.
- **`allow=` on the iframe is not optional decoration.** Three browser features are denied to a
  cross-origin frame by default and each fails _silently_ — see
  [Permissions Policy](#permissions-policy).
- **`title` on the iframe is required for accessibility.** Without one it is announced as an
  unlabelled frame. Write it for your visitors, in your language.
- **Do not sandbox the iframe.** If your platform insists, add `allow-popups` — see
  [Embedding in an iframe](#embedding-in-an-iframe).

Three rules for the script tag specifically:

- **Put it in the body, where the widget should appear.** The element is inserted immediately
  before the script tag. A snippet in `<head>` has nowhere to render and says so in the console.
- **No `async` or `defer`.** The loader reads its own script tag to find both its settings and
  its position, and those attributes hide it.
- **`type="module"` is required** — the loader is an ES module.

`auto.js` is a ~3 KiB loader, not the widget. It works out what your page supports, then fetches
the widget itself only when the embed is about to come into view — so an embed further down your
page costs your visitors almost nothing until they scroll to it.

### What you can add later

Nothing below is needed to get a working embed. Reach for it when you want more:

| You want                                                              | Read                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A different language, no map, or a specific opening view              | [Parameters](#parameters)                                               |
| The embed to fit a column rather than the page                        | [Sizing the element](#sizing-the-element)                               |
| Your page to send a Content-Security-Policy                           | [Content-Security-Policy](#content-security-policy)                     |
| The locate, copy-link or share buttons to work behind a policy header | [Permissions Policy](#permissions-policy)                               |
| Clean paths instead of `?atlas=`                                      | [The URL](#the-url)                                                     |
| To know what the widget touches on your page                          | [What the widget does to your page](#what-the-widget-does-to-your-page) |
| To answer a privacy question                                          | [Privacy](#privacy-storage-and-third-party-requests)                    |

## Contents

- [The two embed codes](#the-two-embed-codes)
- [Parameters](#parameters)
- [Sizing the element](#sizing-the-element)
- [Embedding in an iframe](#embedding-in-an-iframe)
- [The URL](#the-url)
- [Content-Security-Policy](#content-security-policy)
- [Permissions Policy](#permissions-policy)
- [Where to load it from](#where-to-load-it-from)
- [Browser support](#browser-support)
- [What the widget does to your page](#what-the-widget-does-to-your-page)
- [Privacy, storage and third-party requests](#privacy-storage-and-third-party-requests)
- [Updates and caching](#updates-and-caching)
- [Migrating from the old element](#migrating-from-the-old-sahaj-atlas-element)
- [Troubleshooting](#troubleshooting)

## Parameters

Five parameters exist on the script URL, all optional except `key`. Percent-encode reserved
characters as usual (`atlas=%2Fgb%2Flondon` and `atlas=/gb/london` are equivalent).

| Parameter | Default                       | What it does                                                                                                                                                                                                                                                                          |
| --------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`     | —                             | **Required.** Your published SahajCloud client key. An invalid key shows the widget's configuration-error screen, and the loader logs an error naming the problem.                                                                                                                   |
| `locale`  | **your page's `<html lang>`** | Force a UI language, e.g. `fr`. Precedence: **`?locale=` on the page URL** → this parameter → **your page's `<html lang>`** → the browser's language → English. ⚠ A `?locale=` the atlas ships **outranks** this parameter, because the widget writes that parameter itself (below). |
| `map`     | `true`                        | `map=false` renders the atlas as lists and event pages with **no map canvas at all**. No Mapbox, no map token, and none of the Mapbox origins or storage below. Changes how you size it (see [Sizing](#sizing-the-element)).                                                          |
| `routing` | `query`                       | Where the widget's route lives. `path` also needs your server to serve one page for everything under the atlas prefix — a prefix set on your client record, not here.                                                                                                                |
| `atlas`   | —                             | The route to open when the page's own URL does not already name one, e.g. `/gb/london`. Must be site-relative.                                                                                                                                                                       |

**`map` follows one spelling rule: only the exact values `false` and `0` switch it off.**
Anything else — absent, empty, `true`, `no`, `FALSE` — leaves it **on**, so a typo can never
silently disable it. It also means `map=no` does not do what it looks like.

### `atlas`, and how the route is chosen

`atlas` is a **default, not an override**. A route already on the page's own URL always wins:

```
your-page?atlas=/nl/amsterdam   +   auto.js?atlas=/gb/london   →   opens /nl/amsterdam
your-page                       +   auto.js?atlas=/gb/london   →   opens /gb/london
```

A visitor with `?atlas=` in the URL deep-linked, navigated, or followed a shared link, and
sending them to your default instead would discard where they asked to go. Use `atlas` for an
embed that should always open somewhere specific, such as a single city page or a registration
form.

### The widget follows your page's language

**You usually do not need the `locale` parameter.** The widget reads your page's `<html lang>`
and matches it, so a Dutch page gets a Dutch atlas whatever the visitor's browser prefers —
almost always right, since the widget is part of your content rather than a separate app. Reach
for `locale` only when your page's declared language is wrong, missing, or deliberately different
from the atlas you want shown.

**This used to be a setting on your client record, and no longer is, on purpose.** A record-level
language applies to every page you embed on and then must stay in step with a site that may not
be monolingual. `<html lang>` already says it per page, and your CMS already sets it.

#### The widget writes `?locale=` to your page's URL

When a visitor picks a language from the atlas's settings menu, the widget adds
**`?locale=<code>`** to your page's address with `history.replaceState`. It is the second and
last parameter the widget ever _writes_ to your URL, beside `atlas`. (It also _reads and removes_
a third, `feedback` — see [below](#feedback-on-a-page-the-atlas-links-to).)

- **Your own query parameters are preserved byte for byte**, and no history entry is added, so
  the Back button behaves as before. The widget edits only the one pair it writes, so a parameter
  carrying `%20`, `/` or `,` comes back exactly as your page had it, not re-encoded.
- **The choice survives a reload and travels in a copied link** — why it outranks the script-URL
  `locale` above. Pin `locale=fr`, and if a visitor switches to Dutch, the link they share opens
  in Dutch.
- **Nothing is stored on your origin.** The widget writes no cookie and no `localStorage` entry
  for language (see [Privacy](#privacy-storage-and-third-party-requests)). The URL is the whole
  mechanism, so the choice lasts exactly as long as the address that carries it.

An unrecognised `?locale=` is ignored rather than honoured — it falls through the precedence
chain instead of forcing English.

#### `?feedback=` on a page the atlas links to

People who register for a class get a follow-up email asking whether it took place. Both answers
are recorded by SahajCloud and redirect the reader **to your site**, at the canonical URL for
that class or its region, carrying one extra parameter:

```
https://your-site.org/classes/gb/london/1204?feedback=confirmed
https://your-site.org/classes/gb/london?feedback=denied
```

The widget reads it, shows a short dismissible acknowledgement, then **removes it from the
address with `history.replaceState`** — so it does not linger in a copied link or reappear on
every reload.

- **You do not have to add the parameter to anything.** It arrives on links the CMS already
  sends. Your page just has to be reachable at its canonical URL, which it already is.
- **Your own query parameters are untouched**, including their exact encoding. Only the one pair
  is removed, byte for byte.
- **It is never treated as a page of its own.** The canonical URL the widget emits is the CMS's
  clean one, with no `feedback` on it, so the two answers cannot be indexed as duplicates.

A `feedback` value the widget does not recognise is ignored and left alone (it is presumably
yours), with no banner shown.

### What you configure in the CMS instead

Some things are **not** parameters, on purpose:

| Setting                            | Where it lives                                                         |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Display name, brand colours        | your client record                                                     |
| The path prefix for `routing=path` | your client record — the same value your canonical URLs are built from |

Identity is the same on every page you embed on, so making it per-embed only risks two of your
pages disagreeing about what the product is called. The routing prefix is worse than merely
redundant: it is the value we compose your canonical URLs from, so a second copy on a script tag
could disagree with the one the canonical was built from — and a canonical pointing at a URL that
does not restore the view is exactly the failure canonical URLs exist to prevent.

### `routing=path` — clean paths, and what your server has to do

By default the widget's route is a parameter on your page's own URL:
`https://your-site.org/classes?atlas=/gb/london`. With `routing=path` it becomes part of the path
instead — `https://your-site.org/classes/gb/london` — the shape a search engine and a reader both
prefer.

**It asks two things of you, and the widget refuses rather than half-works if either is missing.**

1. **Your server must serve the same page for everything under the prefix.** The widget navigates
   with the History API, so an in-page click never hits your server — but a reload, bookmark, or
   shared link does, and `/classes/gb/london` has to return the page your embed is on. On most
   platforms that is a wildcard route or catch-all rewrite. On WordPress it needs a rewrite rule,
   which the plugin sets up for you.
2. **A canonical embed on your client record**, naming the page the widget is mounted on. The
   prefix comes from there, not this script tag — it is the same value your canonical URLs are
   built from, and two copies could disagree.

**If either is missing, the widget uses query routing and says so in the console**, naming which
one was missing. It never silently switches modes — a host whose server config does nothing
should learn that from us, not from their analytics six months later.

**It does not cost you a round trip.** The widget reads your client record before it can build
its router in either mode, before it renders anything — so path mode makes the same single
request query mode already makes, with the same spinner.

**Your other query parameters are still safe, and there is still only one of ours.** In path mode
the route's _path_ is the pathname and `?atlas=` carries whatever is left — the searched place,
filters, sort order. The rule is the same in both modes: **we set and read exactly one parameter,
and leave every other one on your URL alone.**

⚠ **Existing `?atlas=` links do not survive the switch.** A URL you have already shared or
indexed — `your-site.org/classes?atlas=/gb/london` — opens the root view once path routing is on,
because the route is now read from the path. Plan the change like any URL migration: old links
work right up until you flip it, and not after.

**There are also no privacy opt-outs.** The flows they used to switch off are under
[Privacy](#privacy-storage-and-third-party-requests): analytics is cookieless and aggregate,
crash reports carry no cookies or session replay and reduce your page to origin and path, and the
location lookup is a keyless once-per-session city lookup. If a flow is still a problem for your
privacy notice, talk to the maintainers — the fix is a client-record setting, not something an
editor changes on a script tag.

**One widget per page.** The loader marks the element it takes charge of, so a second copy of the
snippet renders nothing and says so in the console, rather than silently adopting the first
widget's settings. This is a real constraint, not an oversight: two widgets would both write the
same `?atlas=` parameter and fight over it on every navigation.

### What the loader reports back

On each load the widget notes a few things about the page it is on — top-level or framed,
whether the URL can be written, whether a query parameter survives your router — and sends them
to `POST /api/clients/report` once it has actually rendered.

It sends the page's **origin and path only**, as two separate fields. Your query string and
fragment are never included, the same reason crash reports strip them: they can carry a reset
token or an email address. This is how we learn which of your pages can serve as the canonical
atlas page for your region, instead of asking you and keeping the answer current by hand.

**One query parameter is the exception: `?p=<number>`.** WordPress sites on default permalinks
address every page that way, so discarding it would report every post as the same page, leaving
you unable to nominate one — a post id is not something your visitor typed. Anything else in the
query is still dropped whole, including `?p=123&utm_source=…`, rather than trimmed.

It reports on **every load**, not only when something changed — that is what makes "last seen"
mean anything: an embed that reported once and went quiet is indistinguishable from a removed
one. Repeat reports of an unchanged page collapse server-side into at most one write an hour, so
this is one small request per page view, and nothing your visitor sees depends on it.

Two things can refuse it, both configuration rather than a fault in your page, and both reported
to the console while the widget carries on working:

| Console message mentions     | What it means                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the origin is not allowed    | your domain is not on the service's allowed-domains list in the CMS. Unlike the read endpoints, an **empty** list refuses here rather than allowing everything |
| the maximum number of mounts | the service already tracks 50 distinct pages. Pages already known keep reporting                                                                               |

### The readiness marker

Once the widget has genuinely mounted, it sets one attribute on your page's `<html>` element:

```html
<html data-sahaj-atlas-ready='{"v":2,"routing":"query","topLevel":true,"urlWritable":true}'></html>
```

It is written **after** the widget renders, never on script load, and removed again if the widget
unmounts. It exists so our CMS can confirm the embed works, from your own page, before treating
it as your region's canonical page — a claim the widget makes about itself is not evidence.
Nothing on your page needs to read it.

## Sizing the element

**One rule covers both modes: give the element a height and the widget lives inside it.** What
differs is only what happens when you _don't_.

**With `map=false`, a height is required.** The widget fills its container (`height: 100%`), and
an unsized custom element is an inline box of zero height — it collapses and appears not to
render.

**With the map (default), a height is optional and changes the shape you get.**

| What you give the element                                     | What you get                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A height (`height: 640px`, a grid track, an aspect-ratio box). | The map lives **inside that box**, in your page's flow — your header above it, your content below.                                       |
| No height at all.                                              | The map fills the **browser window**. The canvas is `position: fixed; inset: 0`, and the drawers sit over it, whatever size the element is. |

The second is the older behaviour, and still right for a dedicated atlas page — a **full-page
slot** with no surrounding content to cover, since a map halfway down an article covers the
article rather than scaling into it. (An article-column map with no height gets the compact card
instead — see below.)

**A contained map is one element in your layout, and stacks like one.** The widget puts the map,
its panels, and its controls inside a single stacking context, so its internal `z-index` values
never compete with your CSS — a sticky header with a `z-index` floats over the map like any other
content.

Either way, sizing looks the same. The loader inserts the element for you, so size it with a rule
rather than an inline style:

```html
<style>
  sahaj-atlas {
    display: block;
    height: 640px;
  }
</style>
<script type="module" src="https://sahajatlas.com/auto.js?key=…&map=false"></script>
```

(Drop `&map=false` for a contained map instead.) Any way of giving it a height works — a CSS
class, a grid or flex track, an aspect-ratio box. **`display:block` (or `flex`/`grid`) matters as
much as the height**: a custom element defaults to `display: inline`, which cannot take one, so a
height rule with no display rule leaves it unsized and the map takes the window instead.

⚠ **`min-height` on its own is not a height.** The widget fills your element with `height: 100%`,
which needs a definite height to resolve against. `min-height: 640px` sizes the element on screen
but leaves the widget nothing to fill, so it refuses the box, says so in your console, and fills
the browser window instead. Use `height`, a grid or flex track, or `aspect-ratio` (same for width
and `display: inline-block`).

⚠ **Size it to what a visitor can see at once.** Nothing caps a contained map from above: give the
element `height: 100vh` below your own sticky header, and its bottom edge — the mobile bottom
sheet and its drag handle — sits below the fold, leaving a first-time visitor with no visible
controls until they scroll. Subtract your header, or use a fixed height.

⚠ **A flex or grid item is sized even without a height rule.** A stretched item takes its track's
cross size, so `<sahaj-atlas>` in a full-height flex column is a _contained_ map — almost always
what you want, but the one way an embed ends up contained without one.

**The widget adapts to your element, not the browser window** (issue #107), in `map=false` and a
contained map alike. A 320px column on a large desktop screen gets the narrow layout — a bottom
sheet with a drag handle and swipe-to-dismiss — because the widget measures its own box, not the
viewport.

Touch affordances are the deliberate exception, and follow the **device**, not the box: a phone
number is a `tel:` link on a touchscreen and a copyable number everywhere else, however narrow
the column, since whether a dial link reaches a dialer is hardware.

An **unsized** map embed is the one thing that does not adapt, since there is no box to adapt to
— it fills the window. **A map embed with neither a height nor the page to itself renders the
compact card instead**, whose button opens the map full-screen (below).

### When the slot is too small

Below a certain size no layout works, so the widget shows a **compact card** instead: a heading
and one button that opens the whole interface somewhere it fits. Your visitor still gets
everything — it just does not try to live in a 300-pixel box.

**The card is the button.** It takes only the room it needs, centred across whatever box you gave
and sitting at the top of it. Given **no height at all**, it sizes to its own content rather than
collapsing, so a bare `<sahaj-atlas>` in a narrow column renders as a card rather than nothing. It
renders **no events and makes no location lookup** — a control whose whole job is to lead
elsewhere has nothing to show, and does not warm the event feed or region tree, which wait for
the interface to open. It records no analytics pageview either. It is not silent, though: the
widget still reads your client record and sends the one-per-load
[embed report](#what-the-loader-reports-back) while collapsed.

**Where the button goes depends on whether the widget can grow where it is.**

| Your embed                  | The button                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| A script embed on your page | Opens the interface in a full-screen overlay, in place                                       |
| Inside an iframe            | Opens a page that fits, in a new tab (see [Embedding in an iframe](#embedding-in-an-iframe)) |

The floors are **360px wide and 420px tall**, with a second condition that matters as much: **the
widget only degrades when there is somewhere bigger to go.** A slot that is essentially the whole
screen is never called too small, since a card there would take the interface away and hand back
nothing — a full-width phone embed, or a small iframe on a small screen, keeps the normal
interface.

**Map mode is measured differently.** A map embed with **no height of its own** fills the
viewport, so the only question is whether it has the page to itself: one that does not — a map in
an article column — renders the compact card, whose button opens the map full-screen. A map
embed you **gave a height** is not asked that question: it lives in your box, measured exactly
like `map=false`, against the floors above and nothing else.

- **It is decided once, when the widget mounts.** Resizing your page afterwards does not switch
  between the two — that would remount the widget and lose the visitor's navigation. There is
  deliberately no override parameter: a knob for a measurement we can get right is a setting you
  would maintain forever. A wrongly measured slot is a bug worth reporting, not working around.
- **Entering the compact card logs a console warning** naming what was measured and what to
  change, so an unintentionally small slot is findable rather than mysterious.
- **The overlay locks your page's scroll while open**, restored on close. As a modal dialog it
  also marks the rest of your page `aria-hidden` while open, so a screen reader reads the widget
  rather than the page underneath, undone on close too. **It keeps a margin**, so your page stays
  visible behind it and reads as a layer over your site. Three ways out — **clicking outside**,
  **Escape** (steps outward, dismissing whatever is open before closing), and the **×** in the
  corner — all return focus to the button that opened it.
- **A deep link opens the route, and loads eagerly to do it.** `?atlas=/gb/london` on your page's
  URL means a visitor followed a link, so the widget mounts immediately rather than waiting to be
  scrolled to, and the overlay opens straight onto that route. **The `atlas` parameter on the
  script URL does not do this** — that is your default view, not a visitor's request, so it stays
  lazy. Closing the overlay does not reopen it.

⚠ **Do not put the embed inside an element with `transform`, `filter` or `contain`.** Those make
that element the containing block for fixed-position content, confining the overlay to it instead
of the page — and the same applies to an unsized map, which is fixed too. Not a real trap if it
happens (clicking outside and Escape both still close it, wherever confined), but it will look
wrong. (`container-type` is fine — it does not have this effect, however often it is said to.) A
**contained** map is unaffected, since it already establishes that containing block itself. If
you are reaching for one of those properties to stop a map painting over your page, **give the
element a height instead** — the supported way to say the same thing.

## Embedding in an iframe

**The script above is the primary way to embed the atlas.** An iframe is the supported
alternative for platforms that will not let you add a script tag. (`sahajatlas.com` itself is not
a destination — it exists to host these assets and to be framed.)

```html
<iframe
  src="https://sahajatlas.com/?key=YOUR_KEY&map=false"
  title="Find a meditation class near you"
  width="100%"
  height="600"
  loading="lazy"
  allow="geolocation; clipboard-write; web-share"
  style="border: 0"
></iframe>
```

Five things about that snippet are load-bearing:

- **`title` is required for accessibility.** An iframe with no title is announced as an
  unlabelled frame. Write it for your visitors, in your language.
- **`allow="geolocation; clipboard-write; web-share"`** — see [Permissions Policy](#permissions-policy).
  Without these the relevant features fail **silently**, the worst way to find out.
- **Do not sandbox the frame.** If you must, include **`allow-popups`** — without it the compact
  card's button cannot open anything, and the browser blocks it silently with nothing in your
  console to say why. Add **`allow-same-origin`** too if you want the widget to keep its own
  settings between visits, since a sandbox gives the frame an opaque origin, which makes storage
  throw. (A sandbox does _not_ stop the widget writing its own URL, contrary to what this guide
  used to say — measured in Chrome 151.)
- **`map=false` is usually what you want in a frame**, unless the frame is large.
- **Give it a real height.** As with the element, a frame with no height collapses.

**A frame is its own viewport, so `map=true` works inside one** — the map fills the frame rather
than your page. That is the opposite of the advice under [Sizing](#sizing-the-element), which is
about a script embed sharing a page with your content. A frame has no such neighbours.

**If the frame is too small for the interface**, the widget shows the compact card, and its
button opens the atlas in a **new tab** rather than an overlay — an overlay inside a frame would
only cover the frame, the problem it was trying to solve. ⚠ **That new tab currently goes to
`wemeditate.com/map`**, a different organisation's site — per-region canonical ownership will
replace it with the owner's own domain. ⚠ Today that link lands on the map's home page rather
than the exact route the visitor was on. It will carry the route once the canonical work lands.

## The URL

**The widget's route lives in a query parameter on your own page's URL:**

```
https://your-site.example/classes?atlas=/gb/london
```

That is the URL your visitors see, copy, and share — and, the point of the whole thing, the URL a
search engine can index. Every event and every city is a distinct URL on **your** domain.

- **Your other query parameters survive.** We set and read exactly one, `atlas`, and leave the
  rest alone, in both routing modes. WordPress's `/?p=123` permalinks keep working.
- **Your page's `#anchor` is none of our business.** The widget never reads or writes the
  fragment: a page loading at `#respond` scrolls where you expect, anything reading
  `location.hash` still works, and the widget routes normally alongside it. (Before this, it
  routed off the fragment and had to guess whether it or you owned it.)
- **In-widget links are real links.** Middle-click, "copy link address," and open-in-new-tab all
  give somebody a working URL on your site, because every href the widget renders is absolute and
  on your origin.

**Mounting does not add a history entry, and does not touch your URL at all.** The widget only
writes the parameter once a visitor navigates inside it. To make an embed open somewhere
specific, use the [`atlas` parameter](#atlas-and-how-the-route-is-chosen) — the default the
widget starts at when your page's URL names no route.

### If the parameter name collides

`atlas` is not a WordPress reserved query var and does not collide with anything we know of. If
it collides with something on your site, tell the maintainers — the name is a single constant,
not something each embed sets, so the fix is on our side.

### When the route is not in the URL

In a `file://` document, and in any browser that refuses `history.replaceState` outright, the URL
cannot be written at all. The widget detects that at load and routes **in memory** instead: it
works normally, but its route is not in the address bar, so it cannot be deep-linked from that
page, and browser Back leaves your page rather than stepping back through the widget. Where the
widget would offer a share link it offers the event's canonical page instead, and where there is
honestly no link, it offers none rather than handing somebody your page's URL.

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

**One line per directive, deliberately: CSP ignores every repeat of a directive name after the
first**, so splitting `script-src` across two lines silently drops the second, leaving you
believing you allowed something you hadn't. Loading the script from `sahajatlas.pages.dev`? Add
that host too, but keep `https://sahajatlas.com` in `connect-src` regardless — the locale JSON
comes from there either way.

### Why each one, and what breaks without it

| Directive                  | Source                                        | Why                                                                                                                                                                                                                                                    | Blocked ⇒                                                                                     |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `script-src`               | the widget's origin                           | The `<script>` tag fetches a small entry that pulls the rest of the bundle from the same origin. It also pulls the calendar, registration and share panels, but only once a viewer opens them.                                                       | nothing renders — or worse, it renders and then dies on one of those three presses            |
|                            | `api.mapbox.com`                              | Mapbox GL's right-to-left text plugin, loaded on demand from inside the map's worker on first RTL text. Workers inherit the document's policy, so this lands on `script-src` rather than `worker-src`.                                              | Arabic, Hebrew and Persian labels on the map render in the wrong order                        |
|                            | `challenges.cloudflare.com`                   | **Turnstile — required.** Every write the widget makes is captcha-gated, so registration is impossible without it. Loaded as soon as the interface mounts, so a policy that omits it fails immediately rather than at the moment somebody registers. | **the widget shows an error screen and does not run.** Not a degradation — see the note below |
|                            | `cdn.usefathom.com`                           | analytics, only on a build with an analytics ID                                                                                                                                                                                                       | analytics only                                                                                |
| `worker-src` / `child-src` | `blob:`                                       | Mapbox GL compiles its worker bundle into a `Blob` and starts a module Worker from the resulting `blob:` URL. `child-src` is the fallback for engines predating `worker-src`.                                                                        | **the map fails**, the rest of the widget is unaffected                                       |
| `style-src`                | `'unsafe-inline'`                             | **The hard ask.** The widget has no stylesheet to link — it appends `<style>` elements at runtime, which carry no nonce.                                                                                                                              | the widget renders completely **unstyled**, and does not degrade                              |
| `font-src`                 | the widget's origin                           | The typeface is **self-hosted**. No request goes to `fonts.googleapis.com` or `fonts.gstatic.com`, so neither belongs in your policy, and no visitor IP reaches a third party for a font.                                                            | text falls back to your system sans, everything works                                         |
| `img-src`                  | `data:`                                       | The map's pins and cluster bubbles are inline SVG rasterised from a `data:` URI. The widget ships them itself, rather than relying on the map style's sprites.                                                                                       | **the map paints with no pins**                                                               |
|                            | `api.mapbox.com`                              | map tiles, sprites and glyphs                                                                                                                                                                                                                          | the map fails                                                                                 |
|                            | `imagedelivery.net`, `cloud.sydevelopers.com` | event and venue photography. The URL comes from the CMS, so the origin is data rather than a bundle-pinned value. Production serves the Cloudflare Images CDN (`imagedelivery.net`) today. Any relative URL resolves against the API origin.        | images only                                                                                   |
|                            | `react-circle-flags.pages.dev`                | country flag SVGs on the country list and the country-website offer, sent with `referrer-policy: no-referrer`, so your page's URL is never disclosed.                                                                                                | the flag glyphs only, the lists still render                                                  |
| `connect-src`              | `cloud.sydevelopers.com`                      | **the API — every event, region and venue**, plus the one-per-load [embed report](#what-the-loader-reports-back). Same origin, so no addition is needed for it.                                                                                      | **the widget has no data and shows an error screen**                                          |
|                            | `sahajatlas.com`                              | the locale JSON, from a different origin than the script                                                                                                                                                                                              | every string renders as its raw dotted key                                                    |
|                            | `api.mapbox.com`                              | tile and style requests. Also the place-search geocoder, and the reverse lookup naming the visitor's own location for "find my location".                                                                                                            | the map and search fail                                                                       |
|                            | `events.mapbox.com`                           | Mapbox GL's own map-load telemetry                                                                                                                                                                                                                     | nothing visible                                                                               |
|                            | `ipwho.is`                                    | the once-per-session IP→city lookup behind "classes near you"                                                                                                                                                                                         | **degrades**: the nearby suggestion and localized online times are skipped                    |
|                            | `challenges.cloudflare.com`                   | Turnstile's own verification calls                                                                                                                                                                                                                     | **as `script-src` above — the widget does not run**                                           |
|                            | `cdn.usefathom.com`                           | analytics, conditional as above                                                                                                                                                                                                                        | analytics only                                                                                |
|                            | `*.sentry.io`                                 | crash reporting. Contacted **only after the widget has already failed**, and only on a build with a DSN.                                                                                                                                              | **degrades**: the widget notices the refusal and stops trying for the rest of the page's life |
| `frame-src`                | `challenges.cloudflare.com`                   | the Turnstile challenge iframe                                                                                                                                                                                                                         | **the challenge cannot be solved, so no form can be sent**                                    |

Three notes on that table:

**`connect-src cloud.sydevelopers.com` is the entry most likely to be missing, and the most
expensive** — absent from every earlier version of this documentation. Without it, a strict-CSP
host gets a widget that loads, styles itself, and then cannot fetch a single event.

**The `*.sentry.io` wildcard is deliberately that wide.** A CSP host wildcard matches a suffix
only, and Sentry organisations created since 2024 get a _regional_ ingest host
(`o123.ingest.us.sentry.io`, `…de.sentry.io`) that `*.ingest.sentry.io` does **not** match — a
policy written that way looks correct and silently blocks everything. To name one host instead,
take the exact one from the DSN rather than deriving it. Leaving it out is a supported choice:
you get one blocked request and one violation report, not one per error, since the widget
latches off after the first refusal rather than retrying.

**Six entries are load-bearing. The rest cost only the feature in their own row.** If you allow
nothing else, allow these — each breaks the widget as a whole:

|                                        |                                       |
| ---------------------------------------- | --------------------------------------- |
| `script-src` the widget's origin       | nothing renders                       |
| `script-src challenges.cloudflare.com` | the widget shows an error and stops   |
| `style-src 'unsafe-inline'`            | renders completely unstyled           |
| `connect-src cloud.sydevelopers.com`   | no data at all                        |
| `worker-src blob:`                     | the map never renders                 |
| `img-src data:`                        | the map renders with no pins          |

⚠ **`challenges.cloudflare.com` moved into that list, and it is the one change here that can
break a page which used to work.** It was previously a degradation: a host that blocked it got a
working atlas whose report form offered an email address instead of a submit button. It is now
fatal, deliberately — **every write the widget makes is captcha-gated, registration included, and
registration is the thing the atlas exists for.** A blocked challenge meant a visitor could browse
classes and then silently fail to sign up for one, with no reason for the page owner to suspect
anything was wrong. Failing loudly is worse for five minutes and better thereafter.

If your atlas has stopped working since this change, this is almost certainly why: add
`https://challenges.cloudflare.com` to **both** `script-src` and `frame-src`, and to
`connect-src`. The widget also writes the specific directive it needs to the browser console, so
a developer looking at the page gets the answer without opening this document.

Everything else degrades to exactly what its "Blocked ⇒" column says — a missing typeface,
missing photography, missing flags, no analytics, no telemetry. Read the row rather than
assuming — over-allowing because a summary sounded absolute is its own cost on a strict-policy
page.

Two entries are conditional on the build's configuration rather than anything you control:
analytics is absent unless the build carries an analytics ID, and Sentry is absent unless it
carries a DSN. Including them costs nothing if unused. And one omission is deliberate:
**`*.tiles.mapbox.com` is not in the list.** Older Mapbox guidance names it, but this version
routes every tile, glyph and sprite request through `api.mapbox.com`, with no reference to the
legacy host anywhere in the shipped map library. Add it only if you see it in a violation report.

## Permissions Policy

Alongside the origins in the CSP table above, the widget needs three browser **capabilities**.
Each is denied to a cross-origin iframe by default, and each can also be denied to a script embed
by a `Permissions-Policy` header on your own page.

| Feature           | What uses it                                                                      | What breaks without it                            |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| `geolocation`     | The map's "find my location" control, which opens the classes nearest the visitor | The control appears and silently does nothing     |
| `clipboard-write` | The copy-link button on the share sheet                                           | Copying silently fails                            |
| `web-share`       | The native share sheet on mobile                                                  | The share button falls back to the copy/link list |

**All three fail silently rather than erroring**, so nothing in your console will tell you. If
you send a `Permissions-Policy` header, allow these three for your own origin. If you embed in
an iframe, put them in its `allow` attribute as shown above.

## Where to load it from

Two hosts serve the identical bundle:

| Host                           | What it is                                             |
| ------------------------------ | ------------------------------------------------------ |
| `https://sahajatlas.com`       | the production domain — **use this one**               |
| `https://sahajatlas.pages.dev` | the Cloudflare Pages default host for the same project |

**The origin you load the script from is not the only origin the widget contacts, and one of
them is fixed regardless of your choice.** The bundle has the locale-JSON host compiled into it:
whichever host you fetch `auto.js` from, the widget's UI strings are fetched from
`https://sahajatlas.com/locales/…`. That matters only for your CSP, where `connect-src` has to
name it — see the table below. If those requests are blocked, every string in the widget renders
as its raw dotted key name (`events.title`, `nav.search`), which looks like a broken translation
rather than a blocked request.

That host is **compiled in from `VITE_HOST` at build time**, a property of the deployment rather
than of the source — a local build carries whatever the checked-in `.env` says.

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

## Browser support

The bundle targets **Baseline Widely Available 2026-01-01**, which is the Vite 8 default
and is left there deliberately (the map already requires a modern browser):

| Browser        | Minimum |
| -------------- | ------- |
| Chrome / Edge  | 111     |
| Firefox        | 114     |
| Safari (macOS) | 16.4    |
| Safari (iOS)   | 16.4    |

Older browsers are not transpiled for, and fail on modern syntax rather than degrading. There is
no polyfill build.

## What the widget does to your page

**It will not restyle your page.** The stylesheet is injected into your document — there is no
shadow DOM — but every selector is confined to the widget's own subtree (`.sy-atlas`), and every
animation name is namespaced, enforced by a build-time check that fails the build if a rule
escapes. Your headings, links, lists, forms, `.container`, a `.dark` theme class, and your own
Swiper or Mapbox instances are all left alone.

Four honest exceptions, none of them styling your content:

- Opening a modal panel inside the widget sets `overflow: hidden` on your `<body>` while open —
  standard scroll-lock, reverted on close.
- It writes to your page's query string, to exactly two parameters: **`atlas`**, carrying the
  widget's route (see [The URL](#the-url)), and **`locale`**, written once when a visitor picks a
  language from the settings menu. Both go through `history.replaceState` or `pushState`. Your
  own parameters, path, and fragment are preserved, and the widget never reads or writes your
  `#anchor`.
- It sets one attribute, `data-sahaj-atlas-ready`, on your `<html>` element once mounted, and
  removes it again on unmount. See [the readiness marker](#the-readiness-marker) for what it is
  for. No styling, no classes, nothing else of yours is touched.
- **`@font-face` is the one rule that cannot be scoped**, since it carries no selector. The
  widget registers three of them (one per character-set subset) for its self-hosted typeface,
  document-global by nature. They are declared under the family name **`Atlas Rethink Sans`,
  deliberately not a plain typeface name** — so if your page self-hosts the same typeface, the
  widget's faces cannot override yours. That is the whole reason for the odd name. These three
  are the only `@font-face` rules the widget contributes. Mapbox and Swiper register none.

**The reverse direction is now defended, with one documented exception.** The widget resets its
own subtree before applying its styles, so aggressive global CSS on your page — a blanket
`button { … }`, an `a { color: … }`, a global `letter-spacing` — no longer reaches into it.

**The exception is `!important`.** A rule like `div { font-family: … !important }` on your page
still wins: an important declaration beats a non-important one whatever its specificity, and the
only way for us to outrank it would be `!important` ourselves, which would beat our own styles
too and leave the widget unstyled. If the widget looks wrong on your site and right on ours, look
for `!important` in your global CSS first.

### The style-tag ids

The widget appends its styles under two stable ids, kept stable across releases precisely
because host sites key off them:

| Id                  | Holds                                                |
| -------------------- | ------------------------------------------------------ |
| `sahaj-atlas-style` | the widget's stylesheet                              |
| `sahaj-atlas-fonts` | the `@font-face` blocks for the self-hosted typeface |

**`sahaj-atlas-style` is stable, but it is not unique.** The CSS is split alongside the code, so
the widget appends **more than one** element carrying that id over a session — one at load, and
one each when the calendar and the image lightbox are first opened (three in the current build).
`document.getElementById('sahaj-atlas-style')` returns only the first. To get them all, use
`document.querySelectorAll('style#sahaj-atlas-style')`, and expect the count to grow as a visitor
opens more of the widget.

### Accessibility

The widget renders as a labelled `role="region"` landmark, so a screen-reader user can jump to
and out of it rather than meeting an unbounded run of content mid-page. It carries its own `lang`
and `dir`, tracking the active locale — your page's `<html lang>` is almost never the widget's.

## Privacy, storage and third-party requests

Everything the widget does happens in your visitor's browser, on your origin, so your privacy
notice, not ours, is the one that has to describe it. This is the summary. The
[README's privacy section](../README.md#privacy-storage-and-third-party-requests) carries the
full detail on each flow, including exactly what an error report does and does not contain.

**It sets no cookies.** It stores four keys under your origin — two of its own, written inside a
`try`/`catch` so a sandboxed iframe degrades the setting rather than breaking the widget, and two
written by Mapbox GL:

| Key                                | Store            | Holds                                                 | Lifetime            |
| ------------------------------------ | ------------------ | -------------------------------------------------------- | --------------------- |
| `atlas.theme`                      | `localStorage`   | the viewer's light/dark/auto choice                   | until cleared       |
| `atlas.geolocationPromptDismissed` | `sessionStorage` | that they dismissed the "classes near you" suggestion | the browser session |
| `mapbox.eventData:<token>`         | `localStorage`   | Mapbox GL's own telemetry bookkeeping                 | until cleared       |
| `mapbox.eventData.uuid:<token>`    | `localStorage`   | a persistent anonymous id Mapbox generates            | until cleared       |

**The `theme` key used to be un-namespaced** — the bare string `theme` — so a page storing its
own light/dark preference under that name had it read and overwritten. That is fixed: our key is
now `atlas.theme`, and the old one is read once, never written, so nobody loses a choice they
already made. The two `mapbox.*` keys appear only when the map renders, so `map=false` removes
them.

The language picker persists **nothing** — i18next's detector would cache `i18nextLng` on your
origin by default, and that write is switched off.

Three third-party flows leave the browser. **None has a script-URL opt-out** — each is designed
so it does not need one. If a flow is still a problem for your privacy notice, talk to the
maintainers rather than editing the snippet:

- **`ipwho.is`** — a keyless IP→city lookup, once per session, so the widget can offer "classes
  near you" before the visitor types, and show an online class's start time in their own place.
  No referrer, no key, no cookies, a five-second timeout, silent on failure, and skipped entirely
  when neither could show — including for the rest of a session after the visitor dismissed the
  prompt. **An IP is personal data in the EU**, and it is not stored — used to pick a city, then
  discarded.
- **`cdn.usefathom.com`** — cookieless, aggregate pageview counting, loaded only when the bundle
  was built with an analytics ID and your client record names a real primary domain.
  Auto-tracking is off, so it reports the widget's own route under that domain — **your page's
  real URL and query string are never sent**.
- **`*.sentry.io`** — crash reports, sent only when the widget has already broken and only on a
  build with a DSN. Your page reaches it **as origin and path only, never its query string or
  fragment**, which on your site can carry a reset token or an OAuth `#access_token`. It also
  carries the visitor's **`navigator.userAgent`**. No global error handler is installed, so your
  own scripts' exceptions are never captured. No breadcrumbs, no session replay.

**`map=false` removes the Mapbox flows too** — tiles, the geocoder (which sends the visitor's
typed query and the map centre to Mapbox), and the map-load telemetry — along with the two
`mapbox.*` storage keys. That is the only switch for them, since they are Mapbox's own behaviour,
not ours.

Two things a visitor can send us on purpose, both on submit and never in the background: a
**class registration** (their name, email and any organiser questions) and a **report about an
issue** (their message, and the page they were on with its query string and fragment stripped).
Both go over HTTPS to SahajCloud. Neither is stored in the browser.

One thing the widget itself sends in the background, about your page rather than your visitor:
the **embed report** described under [what the loader reports back](#what-the-loader-reports-back)
— your origin and path, and four booleans about how the widget is mounted. Its _body_ carries
nothing about the visitor: no identifier, no location, and none of your query string bar a
WordPress `?p=<number>`. Like any request, it still carries the visitor's IP and `User-Agent` as
headers, which no client-side code can suppress — unlike the crash reports above, which put the
user agent in the payload deliberately.

## Updates and caching

**The embed is evergreen, and there is no version to pin.** `auto.js` is served unhashed from
our origin and updated in place, roughly daily, so every host serves the current build.
[`CHANGELOG.md`](../CHANGELOG.md) is written for embedding sites and records what you can
observe — parameters, origins, CSP, visible behaviour.

**We serve both root files with `Cache-Control: public, max-age=0, must-revalidate`**, so a
browser always asks before reusing one. That is deliberate, and it is the contract: the files
are unhashed and mutable, and they import content-hashed chunks by name.

- **Don't cache `auto.js` or `embed.js` aggressively at your edge.** A stale copy held by a proxy
  or service worker will ask for chunk filenames the CDN no longer serves, and those 404s kill
  the widget with no fallback. Let it revalidate. The hashed chunks underneath it are immutable
  and safe to cache hard.
- Because there is no pinning, a breaking change is a change you receive. The changelog is the
  channel — if you need advance notice for a large deployment, say so to the maintainers rather
  than pinning a URL.

## Migrating from the old `<sahaj-atlas>` element

The element and all nine attributes are gone. Most became query parameters, the rest moved to
your client record or were removed (see [Parameters](#parameters)). The reason is about your
platform, not our taste: WordPress strips `<script>` (and unknown attributes) from saved content
for anyone below Administrator, and for **every** Site Administrator on multisite, while Wix
supplies a bare script URL and its own attribute panel. One mechanism on the URL works
identically on all of them, and the only thing a sanitizer can now destroy is the whole snippet —
a failure you can see.

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

## Troubleshooting

| Symptom                                                               | Likely cause                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nothing renders, a 404 for the script**                             | The filename is `auto.js`. `embed.js` exists but is the widget the loader fetches, not the file you install.                                                                                                          |
| **"Not set up correctly" / configuration error**                      | The parameter is `key`, not `api-key` (renamed when configuration moved onto the script URL). The loader logs an error naming it. Otherwise the key is wrong, revoked, or not yet issued.                              |
| **Nothing renders, no console error, script loaded fine**             | `map=false` with no height on the element — it collapsed to zero. Give it `display:block;height:…`.                                                                                                                   |
| **Console: "the embed script is on this page more than once"**        | Exactly that. Only one widget runs per page, so the second copy renders nothing and its settings are ignored. Remove the extra script tag.                                                                            |
| **The widget renders completely unstyled**                            | `style-src 'unsafe-inline'` is missing from your CSP.                                                                                                                                                                 |
| **Every label reads like `events.title`**                             | The locale JSON is blocked. Add `https://sahajatlas.com` to `connect-src` — a different origin from the script even when you load it from `pages.dev`.                                                                |
| **Widget loads and styles, but shows an error instead of any events** | `connect-src https://cloud.sydevelopers.com` is missing.                                                                                                                                                              |
| **The map area is blank or grey**                                     | `worker-src blob:` (Mapbox starts its worker from a `blob:` URL), or `api.mapbox.com` missing from `img-src`/`connect-src`.                                                                                           |
| **The map renders but has no pins**                                   | `img-src data:` — the pins are inline SVG rasterised from a `data:` URI.                                                                                                                                              |
| **Country flags are missing, everything else fine**                   | `img-src https://react-circle-flags.pages.dev`. Cosmetic.                                                                                                                                                             |
| **The widget shows "its security check was blocked" and nothing else**    | Turnstile is blocked — add `challenges.cloudflare.com` to `script-src`, `frame-src` and `connect-src`. The browser console carries the exact directive. This used to degrade the report form instead — since the atlas cannot take a registration without it, it now fails outright. |
| **The widget's route never appears in the address bar**               | The document refuses `history.replaceState` — most often `file://`. The widget detects that and routes in memory.                                                                                                     |
| **The compact card's button does nothing, in an iframe**              | The frame is sandboxed without `allow-popups`, so its `target="_blank"` link cannot open. It fails silently, with nothing in the console. Add `allow-popups`, or drop `sandbox`.                                       |
| **`atlas=` on the script URL seems to be ignored**                    | The page's own URL already carries an `?atlas=` route, which always wins. That is intended — see [`atlas`, and how the route is chosen](#atlas-and-how-the-route-is-chosen).                                          |
| **Sharing offers no link**                                            | The same memory-routing mode, on a page with no canonical atlas URL to offer instead.                                                                                                                                 |
| **The widget covers the rest of the page**                            | A map embed with no height of its own renders `position: fixed; inset: 0`. Give the element a `display: block` and a height to keep the map inside it, or use `map=false` for an embed with no map.                   |
| **The widget looks wrong on your site only**                          | Your global CSS is reaching into it. The widget scopes its own styles out of your page, but has no shadow DOM to keep yours out.                                                                                       |
| **It broke after working yesterday**                                  | The embed updates in place. Check [`CHANGELOG.md`](../CHANGELOG.md). Then look for a cached `auto.js` or `embed.js` at your edge requesting chunk names that no longer exist.                                          |
| **Console: "could not find a place to render"**                       | The snippet is in `<head>`, or carries `async`/`defer`. Move it into the body without those attributes, or add an empty `<sahaj-atlas></sahaj-atlas>` where the widget should appear.                                 |
| **Console: "no `key` parameter on the embed script URL"**             | The query string is missing or was stripped. Some page builders drop everything after `?` from a script URL — if so, that platform cannot host the widget this way. Talk to the maintainers.                          |
| **The widget only appears when you scroll to it**                     | Intended. The loader defers fetching the widget until it nears the viewport. A below-the-fold widget therefore costs visitors nothing until they reach it.                                                             |

If none of these fit, the widget's own **Report an issue** form (behind the settings
control, and offered on most error screens) reaches the maintainers with the failure
already attached.
