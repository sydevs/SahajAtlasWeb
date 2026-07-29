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
 *
 * ~4 KB of static strings: no fetch, no CMS round trip. Notes on the data, so a
 * refresh doesn't "fix" them by mistake:
 *
 * - 57 of the 95 are plain `http://`, kept verbatim as published (a top-level `http`
 *   link opened in a new tab is not mixed content, though it is MITM-exposed — no
 *   guessing at `https` here, since a wrong guess is a dead link).
 * - ~20 point at a Facebook / Blogspot / WordPress page rather than a domain —
 *   that IS the country's presence.
 * - One site can cover several countries: `farsimeditation.com` serves
 *   `AF`/`IR`/`TJ`/`TM`/`UZ`, `sahajayogameditationafrica.com` serves `MG`/`MZ`/`TG`/`ZA`.
 * - `AW`/`HK`/`NC`/`PF`/`TW` are non-sovereign territories, kept because Mapbox's
 *   geocoder still reports them as a `country_code`.
 *
 * It's a snapshot — link rot is expected and out of scope (see issue #82).
 */
export const COUNTRY_SITES: Record<string, string> = {
  AD: 'http://sahajayogaandorra.org',
  AE: 'https://sahajayogauae.yoga',
  AF: 'https://farsimeditation.com',
  AL: 'https://www.facebook.com/SahajaYogaAlbania/',
  AR: 'http://sahajayoga-cba.freeservers.com/',
  AT: 'http://www.sahajayoga.at/index.php',
  AU: 'https://meditateforfree.au',
  AW: 'https://www.facebook.com/SahajaMeditationAruba',
  BA: 'https://www.facebook.com/sahajayogabosna/',
  BD: 'http://bangladesh.sahajaworld.org/english/index.htm',
  BE: 'http://www.sahajayoga.be/',
  BG: 'http://www.sahajayoga-bg.org/',
  BH: 'http://sahajayogabahrain.com',
  BO: 'https://www.facebook.com/sahajayogabolivia/',
  BR: 'http://www.sahajayoga.org.br/',
  BY: 'http://sahajayoga.by/',
  CA: 'https://www.sahajayoga.ca/',
  CH: 'http://www.sahajayoga.ch/en/',
  CL: 'http://www.sahajayoga.cl/',
  CN: 'http://www.sahajayoga.org.cn/',
  CO: 'https://www.sahaja-yoga.co',
  CY: 'https://sahajayogacyprus.wordpress.com/',
  CZ: 'http://www.nirmala.cz/',
  DE: 'https://www.sahajayoga.de',
  DK: 'http://sahajayoga.dk/',
  EC: 'https://www.facebook.com/Sahaja-Yoga-Ecuador-109546592481416/',
  EE: 'http://www.sahajayogaparnu.ee/',
  ES: 'http://sahajayoga.es/',
  FI: 'http://www.jooga.org/',
  FJ: 'http://www.meditation.com.fj/',
  FR: 'http://sahajayoga.fr/',
  GA: 'https://www.sahajayogaafrica.com/gabon',
  GB: 'http://www.sahajayoga.org.uk/',
  GH: 'http://www.meditationghana.com/',
  GR: 'http://www.sahajayoga.gr/en/',
  HK: 'https://www.freemeditation.hk',
  HR: 'http://www.sahajayogacroatia.org/',
  HU: 'https://sahajajoga.hu/',
  ID: 'https://www.sahajayoga-id.com/',
  IE: 'http://www.sahajayoga.ie/',
  IL: 'http://www.sahajayoga.org.il/',
  IN: 'http://www.sahajayoga.org.in/',
  IR: 'https://farsimeditation.com/',
  IS: 'https://sahajayoga.is/',
  IT: 'http://www.sahajayoga.it/',
  JP: 'http://www.sahajayogajp.org/',
  KE: 'http://www.meditationkenya.com/',
  KH: 'https://www.facebook.com/Sahaja-Yoga-Cambodia',
  KR: 'https://meditatekorea.com/',
  KW: 'http://sahajayogakuwait.blogspot.com.au/',
  KZ: 'http://kazakhstan.sahajayoga.ru/',
  LT: 'http://www.sahadzajoga.lt/',
  LU: 'https://www.facebook.com/sahajayogaluxembourg/',
  LV: 'http://sahadza.weebly.com/',
  MD: 'https://sahajayogamoldova.weebly.com/',
  MG: 'https://www.sahajayogameditationafrica.com/',
  MT: 'http://sahajayoga.com.mt/',
  MX: 'http://www.sahajayoga.org/worldwidecontacts/country.asp?ID=140',
  MY: 'https://sahajayogamy.org',
  MZ: 'http://sahajayogameditationafrica.com/',
  NC: 'https://www.facebook.com/Sahaja-Yoga-Noum%C3%A9a-477754978957524/',
  NG: 'https://www.sahajayogaafrica.com/nigeria',
  NL: 'http://www.sahajayoga.nl/',
  NO: 'http://www.sahajayoga.no/',
  NP: 'http://sahajayoganepal.org/',
  NZ: 'http://www.freemeditationnz.com/',
  OM: 'https://www.facebook.com/omansahajayoga/',
  PE: 'https://www.facebook.com/SahajaYogaPeru/',
  PF: 'https://sahajayogatahitidotorg.wordpress.com',
  PG: 'http://www.meditation-png.com',
  PH: 'http://www.sahajayoga-ph.com/',
  PK: 'https://www.facebook.com/Sahaja-Yoga-Pakistan-1580040902271884/',
  PL: 'http://sahajayoga.pl/',
  PT: 'https://www.facebook.com/sahajayogalisboa/',
  RO: 'http://www.sahajayoga.ro/',
  RS: 'http://www.sahajasrbija.org/',
  RU: 'http://sahajayoga.ru/',
  SE: 'http://www.sahajayoga.se/',
  SG: 'http://www.singaporemeditation.org/',
  SI: 'http://www.jogaslovenija.org/',
  SK: 'http://www.sahadzajoga.sk',
  TG: 'http://sahajayogameditationafrica.com/',
  TH: 'https://www.facebook.com/SahajaYogaThailand',
  TJ: 'https://farsimeditation.com/',
  TM: 'https://farsimeditation.com/',
  TO: 'http://www.meditation.to',
  TR: 'http://www.sahajayoga.com.tr/',
  TW: 'http://www.sahajayoga-tw.com/',
  UA: 'http://www.sahajayoga.org.ua/',
  US: 'https://us.sahajayoga.org',
  UY: 'https://www.facebook.com/sahajayogauruguay/',
  UZ: 'https://farsimeditation.com/',
  VE: 'http://sahajayogavenezuelameditacion.blogspot.com.au/',
  VN: 'https://sahajayoga.vn',
  ZA: 'http://www.sahajayogameditationafrica.com/',
}

/**
 * The country's own site, or `undefined` when it isn't one of the 95 (most of the
 * world isn't). Case-insensitive by construction — like `platformsForCountry`, so
 * neither a lowercase region slug nor an uppercase `?cc` has to be normalized at
 * the call site.
 */
export const countrySite = (code?: string | null): string | undefined =>
  (code && COUNTRY_SITES[code.toUpperCase()]) || undefined
