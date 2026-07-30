// National Sahaja Yoga websites, offered when a search lands in a country that
// lists no programs at all (issue #82). A hand-maintained ISO alpha-2 → URL table
// with a case-normalizing accessor, mirroring `PLATFORMS_BY_COUNTRY` /
// `platformsForCountry` in `./share/platforms.ts` — the same shape of static,
// country-keyed data this app already carries.
//
// Source: https://shrimataji.org/map/world.html — scraped 2026-07-29 (96 rows →
// 95 countries; the continent-level "Africa" row isn't a country and is dropped).
// English names were resolved to canonical alpha-2 via `Intl.DisplayNames`, legacy
// aliases excluded (`GB`≠`UK`, `RS`≠`CS`/`YU`, `DE`≠`DD`, `FR`≠`FX`, `RU`≠`SU`),
// with overrides for the page's own typos ("Switerland" → `CH`, "Tajikestan" → `TJ`).

/**
 * ISO alpha-2 (**uppercase**) → the country's own site. Exported for its spec and
 * for story fixtures; read it through `countrySite` so the casing is handled.
 * Typed with `| undefined` because a miss is the common case — most of the world
 * isn't in here, and `noUncheckedIndexedAccess` is off, so a bare index would
 * otherwise type as `string` and hand a consumer an `undefined` href.
 *
 * ~4 KB of static strings: no fetch, no CMS round trip. Notes on the data, so a
 * refresh doesn't "fix" them by mistake:
 *
 * - The source page publishes 57 of these as plain `http://`. Each was probed over
 *   HTTPS and the 43 that answer 200 without downgrading are stored as `https://`,
 *   so the widget never hands a viewer a MITM-able hop to a site it just vouched
 *   for. The **14** with no working HTTPS today — `AR CL CN EE GH GR HR KE KZ LV MT
 *   MX NZ TR` — stay `http://` as published rather than becoming dead links; re-probe
 *   them on the next refresh instead of assuming either way.
 * - ~20 point at a Facebook / Blogspot / WordPress page rather than a domain —
 *   that IS the country's presence.
 * - One site can cover several countries: `farsimeditation.com` serves
 *   `AF`/`IR`/`TJ`/`TM`/`UZ`, `sahajayogameditationafrica.com` serves `MG`/`MZ`/`TG`/`ZA`.
 * - `AW`/`HK`/`NC`/`PF`/`TW` are non-sovereign territories, kept because Mapbox's
 *   geocoder still reports them as a `country_code`.
 * - A handful sit on free-tier subdomains (`*.weebly.com`, `*.blogspot.com`,
 *   `freeservers.com`): those names are re-registrable if the account lapses, and
 *   this table is compile-time, so replacing one needs a rebuild + a redeploy of
 *   every host. Moving the mapping into SahajCloud (issue #82, out of scope) is what
 *   would make it editable.
 *
 * It's a snapshot — link rot is expected and out of scope (see issue #82).
 */
export const COUNTRY_SITES: Record<string, string | undefined> = {
  AD: 'https://sahajayogaandorra.org',
  AE: 'https://sahajayogauae.yoga',
  AF: 'https://farsimeditation.com',
  AL: 'https://www.facebook.com/SahajaYogaAlbania/',
  AR: 'http://sahajayoga-cba.freeservers.com/',
  AT: 'https://www.sahajayoga.at/index.php',
  AU: 'https://meditateforfree.au',
  AW: 'https://www.facebook.com/SahajaMeditationAruba',
  BA: 'https://www.facebook.com/sahajayogabosna/',
  BD: 'https://bangladesh.sahajaworld.org/english/index.htm',
  BE: 'https://www.sahajayoga.be/',
  BG: 'https://www.sahajayoga-bg.org/',
  BH: 'https://sahajayogabahrain.com',
  BO: 'https://www.facebook.com/sahajayogabolivia/',
  BR: 'https://www.sahajayoga.org.br/',
  BY: 'https://sahajayoga.by/',
  CA: 'https://www.sahajayoga.ca/',
  CH: 'https://www.sahajayoga.ch/en/',
  CL: 'http://www.sahajayoga.cl/',
  CN: 'http://www.sahajayoga.org.cn/',
  CO: 'https://www.sahaja-yoga.co',
  CY: 'https://sahajayogacyprus.wordpress.com/',
  CZ: 'https://www.nirmala.cz/',
  DE: 'https://www.sahajayoga.de',
  DK: 'https://sahajayoga.dk/',
  EC: 'https://www.facebook.com/Sahaja-Yoga-Ecuador-109546592481416/',
  EE: 'http://www.sahajayogaparnu.ee/',
  ES: 'https://sahajayoga.es/',
  FI: 'https://www.jooga.org/',
  FJ: 'https://www.meditation.com.fj/',
  FR: 'https://sahajayoga.fr/',
  GA: 'https://www.sahajayogaafrica.com/gabon',
  GB: 'https://www.sahajayoga.org.uk/',
  GH: 'http://www.meditationghana.com/',
  GR: 'http://www.sahajayoga.gr/en/',
  HK: 'https://www.freemeditation.hk',
  HR: 'http://www.sahajayogacroatia.org/',
  HU: 'https://sahajajoga.hu/',
  ID: 'https://www.sahajayoga-id.com/',
  IE: 'https://www.sahajayoga.ie/',
  IL: 'https://www.sahajayoga.org.il/',
  IN: 'https://www.sahajayoga.org.in/',
  IR: 'https://farsimeditation.com/',
  IS: 'https://sahajayoga.is/',
  IT: 'https://www.sahajayoga.it/',
  JP: 'https://www.sahajayogajp.org/',
  KE: 'http://www.meditationkenya.com/',
  KH: 'https://www.facebook.com/Sahaja-Yoga-Cambodia',
  KR: 'https://meditatekorea.com/',
  KW: 'https://sahajayogakuwait.blogspot.com.au/',
  KZ: 'http://kazakhstan.sahajayoga.ru/',
  LT: 'https://www.sahadzajoga.lt/',
  LU: 'https://www.facebook.com/sahajayogaluxembourg/',
  LV: 'http://sahadza.weebly.com/',
  MD: 'https://sahajayogamoldova.weebly.com/',
  MG: 'https://www.sahajayogameditationafrica.com/',
  MT: 'http://sahajayoga.com.mt/',
  MX: 'http://www.sahajayoga.org/worldwidecontacts/country.asp?ID=140',
  MY: 'https://sahajayogamy.org',
  MZ: 'https://sahajayogameditationafrica.com/',
  NC: 'https://www.facebook.com/Sahaja-Yoga-Noum%C3%A9a-477754978957524/',
  NG: 'https://www.sahajayogaafrica.com/nigeria',
  NL: 'https://www.sahajayoga.nl/',
  NO: 'https://www.sahajayoga.no/',
  NP: 'https://sahajayoganepal.org/',
  NZ: 'http://www.freemeditationnz.com/',
  OM: 'https://www.facebook.com/omansahajayoga/',
  PE: 'https://www.facebook.com/SahajaYogaPeru/',
  PF: 'https://sahajayogatahitidotorg.wordpress.com',
  PG: 'https://www.meditation-png.com',
  PH: 'https://www.sahajayoga-ph.com/',
  PK: 'https://www.facebook.com/Sahaja-Yoga-Pakistan-1580040902271884/',
  PL: 'https://sahajayoga.pl/',
  PT: 'https://www.facebook.com/sahajayogalisboa/',
  RO: 'https://www.sahajayoga.ro/',
  RS: 'https://www.sahajasrbija.org/',
  RU: 'https://sahajayoga.ru/',
  SE: 'https://www.sahajayoga.se/',
  SG: 'https://www.singaporemeditation.org/',
  SI: 'https://www.jogaslovenija.org/',
  SK: 'https://www.sahadzajoga.sk',
  TG: 'https://sahajayogameditationafrica.com/',
  TH: 'https://www.facebook.com/SahajaYogaThailand',
  TJ: 'https://farsimeditation.com/',
  TM: 'https://farsimeditation.com/',
  TO: 'https://www.meditation.to',
  TR: 'http://www.sahajayoga.com.tr/',
  TW: 'https://www.sahajayoga-tw.com/',
  UA: 'https://www.sahajayoga.org.ua/',
  US: 'https://us.sahajayoga.org',
  UY: 'https://www.facebook.com/sahajayogauruguay/',
  UZ: 'https://farsimeditation.com/',
  VE: 'https://sahajayogavenezuelameditacion.blogspot.com.au/',
  VN: 'https://sahajayoga.vn',
  ZA: 'https://www.sahajayogameditationafrica.com/',
}

/**
 * The country's own site, or `undefined` when it isn't one of the 95 (most of the
 * world isn't). Case-insensitive by construction — like `platformsForCountry`, so
 * neither a lowercase region slug nor an uppercase `?cc` has to be normalized at
 * the call site.
 */
export const countrySite = (code?: string | null): string | undefined =>
  (code && COUNTRY_SITES[code.toUpperCase()]) || undefined
