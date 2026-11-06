# Product

<!-- impeccable:product-schema 1 -->

> Written on 5 Nov 2026 from review notes, call notes, host feedback and the code, which the
> product owner approved in place of an interview. Sources are in brackets.

## Platform

web

## Users

- **A seeker** is the primary user: often older, often new to meditation, often on a phone. They
  want a free class near them and need one answer: when and where can I go? (briefs) Some are
  travellers planning classes on set dates elsewhere. (July call)
- **A class host** runs a class and wants it listed right: time, place, contact, how to sign up.
  Many are older volunteers on phones. They ask how to get listed and want posters people can
  scan. A helper may list a class they don't run. (UK hosts; add-a-class work)
- **An attendee** who found a listing wrong wants to fix one thing quickly, or report that nobody
  was there, without needing to know the facts. (add-a-class work; UK hosts)
- **Coordinators** (country and regional managers in SahajCloud) review listings and corrections,
  answer reminders and keep listings current, work that is mostly human. (July call; UK hosts)
- **Host sites** are national and local Sahaja Yoga sites that embed the Atlas. (July call; code)

## Product Purpose

Sahaj Atlas shows free Sahaja Yoga meditation classes worldwide, on a map and in lists, as a
widget that host sites embed. It exists so someone who wants to meditate finds a real class they
can go to: when and where it meets, how to register, how to get there. (code; briefs)

Success means:

- A seeker on a phone knows when and where to go within a few taps, and the class is running
  when they arrive. (briefs; UK hosts)
- A search for a place with no class says so plainly, then shows the nearest and online classes.
  (product owner, remarks 7 and 13)
- A class host lists a class from a phone in about two minutes and trusts it went through. An
  attendee fixes one wrong detail in under 30 seconds. (add-a-class work)
- The Atlas looks right inside a host's page, narrow columns included, and does at least what
  the WordPress events plugin the Australian coordinators use today does, then better. (July call)

## Positioning

- One worldwide listing of free classes, kept in SahajCloud by the people who run and coordinate
  them, shown inside many host sites at once, rather than one site's own calendar. (code; July call)
- Every country, region, city, venue and class has its own link for posters, QR codes and
  shares, and that link points back to the host's site. (July call; code)
- The map is the default view, since people find it easiest; lists and a calendar sit beside it.
  (July call)

## Operating Context

- **Embedded, not a destination.** A host adds one script tag or an iframe. The widget fills the
  page or sits in a box; below a minimum size it shows a compact card that opens the map. The
  host owns the page: the route lives in the host's URL, share and canonical links point to the
  host's site, and the widget never takes over its head, styles or history. A host's SahajCloud
  record holds its display name, brand colours and allowed domains. (code; July call)
- **Narrow columns are normal.** The Australian site puts the Atlas in a tab inside an accordion,
  and the product owner agreed to design for narrow containers. (July call)
- **Phones first.** On a phone the panel is a bottom sheet over the map; on wide screens, a side
  panel. iOS Safari is a known risk: keyboard, sheet drag, tap versus hover. (iOS walkthrough)
- **Copy is CMS-owned.** Visitor-facing text lives in SahajCloud; the repo's English file is a
  snapshot, so new copy needs a new CMS key. Only English is published, though classes run in
  14 languages. (code; iOS walkthrough; product owner, remark 3)
- **Data.** SahajCloud holds classes, regions, registrations and submissions; the map and place
  search are Mapbox. On 5 Nov 2026 the feed had 443 classes: 95% weekly, 95% in person, 73% in
  the evening. (product owner, remark 3; code)
- **Location.** An IP lookup lets the Atlas suggest classes near a city. The product owner decided
  to ask first, with a notice, and never zoom there automatically. (July call)
- **Keeping listings current.** Managers create classes in SahajCloud and get reminders; a class
  is unpublished about 35 days after an unanswered one (read from a SahajCloud branch, unchecked).
  Registrants are asked by email whether the class took place. (UK hosts; code)

## Capabilities and Constraints

On main today (code): browsing and place search, filters, online classes, a calendar, pin hover
with timing; class pages with register (free, in the widget with optional organiser questions,
or on an external site), directions, contact and share; registration caps; report an issue;
light or dark theme; published languages; lists with no map; a start view per embed. Classes are
in person or online (joining details come after registering), and weekly, daily, monthly,
limited-run, one-off or by request.

In review, not on main: "Add a class" and "Suggest a correction" (PR #318), where submissions go
to a coordinator, not straight onto the map; and UX proposals for filters, results, the class
page, navigation and narrow embeds. The product owner approves; the developer reviews and merges.

Constraints:

- The bundle is public: no secrets in client code. No cookies, and few third parties, each listed
  in the README so hosts can cover them in their privacy notices. One widget per page. (code)
- Host colours repaint the widget, so meaning can't depend on one fixed colour. (code; briefs)
- A class with no exact location must not show a precise pin. (July call)
- API access for a country, read or write, is granted only on request, case by case. (July call)

Terminology: say **class**, not "event", in anything a visitor reads; code and data still say
event (briefs). A **class host** runs a class; a **host site** embeds the Atlas; keep them apart.
A **seeker** looks for a class; a **coordinator** manages listings.

## Brand Commitments

- Part of the We Meditate family: a sibling of the We Meditate app. Host sites keep their own
  name and colours. (briefs; code)
- Classes are free, and the interface says so. (code)
- Voice: plain, warm, unhurried. Short sentences, everyday words, sentence case, plain verbs.
  Never sales-like: "Register for free", not "Register Now". (briefs; product owner, remark 9)
- Personality: welcoming, like a friend who meditates. The product owner's main round-2 note was
  that the result felt cold; it must feel warm, friendly and cozy. (product owner, round 2)

## Evidence on Hand

- Outside this repo, as they name private people: the product owner's review (14 remarks, then 13
  round-2 items, 5 Nov 2026); July 2026 call notes; UK hosts' feedback checked against the live
  site (of 52 UK and Ireland classes, 45 have a postcode, 44 a venue name, 15 no phone, email or
  website); an iOS Safari walkthrough (simulators only); add-a-class stories and prototypes.
- In this repo: `docs/embedding.md`, the README privacy section, `src/config/translations.en.json`.
- Not on hand, so never invent: tests with real seekers or class hosts or on a real iPhone, usage
  figures, testimonials, quotes from named people.

## Product Principles

1. **When and where first.** Every class view answers these before anything else. (briefs)
2. **Never a dead end, never lost.** One obvious next step per screen; going back is obvious; a
   by-request, finished or empty result still offers nearby or online classes. (product owner,
   remarks 5, 10, 13; UK hosts; July call)
3. **Honest about place and promises.** Say plainly when nothing is here, what is elsewhere and
   how far. Show true details such as postcodes. Never promise what the system doesn't do.
   (product owner, remark 7; UK hosts; add-a-class work)
4. **Fit the host, ask before acting.** Work in narrow columns and on phones; respect the host's
   page, link, brand and copy; ask before moving to a guessed location. (July call; code)
5. **Calm, warm, minimal.** Show only what helps the current choice, such as only the filters
   that apply, with little decoration and never a cold feel. (product owner, remark 3; round 2)

## Accessibility & Inclusion

- Many visitors are older, new to meditation and on phones: plan for slow reading, 44px touch
  targets on phones, small phones (375×667) and 360px columns. (briefs)
- Contrast: body text 4.5:1, icons and large text 3:1. Respect reduced motion. (briefs)
- Don't rush people: prompts and timeouts must allow for slow readers. (iOS walkthrough)
- The widget is a labelled landmark with its own language for screen readers. (code)

## Open Decisions

- **Promises:** Are all classes free, with no exceptions? Can people just turn up, or must they
  register? Is every class open to beginners? No success targets are set.
- **Listings:** Publish class hosts' emails (needs a host opt-in)? Keep classes that miss a
  reminder visible as "not recently confirmed", hiding them after about six months? A "no exact
  location" field in SahajCloud? Contact-only listings where addresses can't be shown, and who
  may publish a phone number? Northern Ireland: a cross-border section on the Irish site, or move
  it under Ireland?
- **Finding classes:** How far "near" reaches (today 300 km, 150 km across a border, plus all
  online classes)? Place search favouring the site's country, without bare street names?
  Date-first browsing and a shareable week view? A link from the "near you" notice to the local
  country site, which sends visitors off the host's site?
- **Embedding:** A per-embed switch to turn filters off (nobody agreed in the call)? Start in the
  list with the map one tap away? Compact card below 360px, or the full interface down to 280px?
- **Links:** Which public address shared links and QR codes use (wemeditate.com or sahajatlas.com)?
  A QR code in Share, or a guide? What a finished class's link offers: nearby classes, a link the
  class host picks, or the We Meditate app, given hosts with their own brand?
- **Language and inclusion:** Publish more interface languages, and who edits and translates CMS
  copy? Times as the browser asks (24-hour in the UK) or always am/pm? A GDPR review of the
  registration consent wording? (Settled in round 2: the theme follows the device's light or dark
  setting, per the product owner.)
- **Adding a class (PR #318):** Use direction A+? External sign-up (such as Meetup) by hand or via
  SahajCloud? Nobody-there reports without an email? Drafts kept after a reload? A test with a
  real class host first? Replies straight to the sender? A time-based duplicate warning?
  Venue-name search at extra cost?
