// A bigger atlas on top of the SahajCloud fixtures, for Ladle's interactive widget (`.ladle/backend.ts`):
// enough countries, regions, cities and classes that every list in the widget scrolls. The
// browser lane keeps reading `sahajcloud.ts` alone, so nothing here moves a scenario.
//
// Real places at their real coordinates, with classes made up around them. Dates are computed
// from the clock, as `events.ts`'s are, so a class is never in the past.
import type { Json } from './sahajcloud'

import { DateTime } from 'luxon'

import { WEEKDAY_CODES, mockEventImages } from './events'
import { mockReportForm } from './report-form'
import {
  SAHAJCLOUD_EVENT,
  onePage,
  paginated,
  regionNodes,
  regionRefOf,
  toJson,
  sahajCloud,
} from './sahajcloud'

type City = readonly [name: string, latitude: number, longitude: number]
/** A region, its cities, and the zone its classes run in where it differs from the country's. */
type Area = readonly [name: string, cities: readonly City[], zone?: string]
type Country = { code: string; name: string; zone: string; language: string; areas: Area[] }

const COUNTRIES: Country[] = [
  {
    code: 'GB',
    name: 'United Kingdom',
    zone: 'Europe/London',
    language: 'en',
    areas: [
      ['Greater London', [['London', 51.5074, -0.1278], ['Croydon', 51.3762, -0.0982], ['Harrow', 51.5806, -0.3420], ['Enfield', 51.6538, -0.0799]]], // prettier-ignore
      ['Cambridgeshire', [['Cambridge', 52.2053, 0.1218], ['Ely', 52.399, 0.262], ['Peterborough', 52.5695, -0.2405], ['Huntingdon', 52.3306, -0.1862]]], // prettier-ignore
      ['Greater Manchester', [['Manchester', 53.4808, -2.2426], ['Salford', 53.4875, -2.2901], ['Stockport', 53.4106, -2.1575], ['Bolton', 53.5769, -2.4282]]], // prettier-ignore
      ['West Midlands', [['Birmingham', 52.4862, -1.8904], ['Coventry', 52.4068, -1.5197], ['Wolverhampton', 52.5862, -2.1288]]], // prettier-ignore
      ['West Yorkshire', [['Leeds', 53.8008, -1.5491], ['Bradford', 53.795, -1.7594], ['Huddersfield', 53.6458, -1.785], ['Wakefield', 53.6833, -1.4977]]], // prettier-ignore
      [
        'Merseyside',
        [
          ['Liverpool', 53.4084, -2.9916],
          ['Birkenhead', 53.3934, -3.0148],
        ],
      ],
      [
        'Oxfordshire',
        [
          ['Oxford', 51.752, -1.2577],
          ['Banbury', 52.0629, -1.3398],
        ],
      ],
      ['East Sussex', [['Brighton', 50.8225, -0.1372], ['Eastbourne', 50.7684, 0.2905], ['Hastings', 50.8543, 0.5735]]], // prettier-ignore
      ['Tyne and Wear', [['Newcastle upon Tyne', 54.9783, -1.6178], ['Sunderland', 54.9069, -1.3838]]], // prettier-ignore
      [
        'Devon',
        [
          ['Exeter', 50.7184, -3.5339],
          ['Plymouth', 50.3755, -4.1427],
        ],
      ],
      ['Scotland', [['Edinburgh', 55.9533, -3.1883], ['Glasgow', 55.8642, -4.2518], ['Aberdeen', 57.1497, -2.0943], ['Dundee', 56.462, -2.9707]]], // prettier-ignore
      [
        'Wales',
        [
          ['Cardiff', 51.4816, -3.1791],
          ['Swansea', 51.6214, -3.9436],
        ],
      ],
    ],
  },
  {
    code: 'IN',
    name: 'India',
    zone: 'Asia/Kolkata',
    language: 'hi',
    areas: [
      ['Maharashtra', [['Mumbai', 19.076, 72.8777], ['Pune', 18.5204, 73.8567], ['Nagpur', 21.1458, 79.0882]]], // prettier-ignore
      ['Delhi', [['New Delhi', 28.6139, 77.209]]],
      [
        'Karnataka',
        [
          ['Bengaluru', 12.9716, 77.5946],
          ['Mysuru', 12.2958, 76.6394],
        ],
      ],
      ['Tamil Nadu', [['Chennai', 13.0827, 80.2707]]],
      ['West Bengal', [['Kolkata', 22.5726, 88.3639]]],
    ],
  },
  {
    code: 'IT',
    name: 'Italy',
    zone: 'Europe/Rome',
    language: 'it',
    areas: [
      [
        'Lombardy',
        [
          ['Milan', 45.4642, 9.19],
          ['Bergamo', 45.6983, 9.6773],
        ],
      ],
      ['Lazio', [['Rome', 41.9028, 12.4964]]],
      [
        'Tuscany',
        [
          ['Florence', 43.7696, 11.2558],
          ['Pisa', 43.7228, 10.4017],
        ],
      ],
      ['Piedmont', [['Turin', 45.0703, 7.6869]]],
    ],
  },
  {
    code: 'AU',
    name: 'Australia',
    zone: 'Australia/Sydney',
    language: 'en',
    areas: [
      [
        'New South Wales',
        [
          ['Sydney', -33.8688, 151.2093],
          ['Newcastle', -32.9283, 151.7817],
        ],
      ],
      ['Victoria', [['Melbourne', -37.8136, 144.9631], ['Geelong', -38.1499, 144.3617]], 'Australia/Melbourne'], // prettier-ignore
      ['Queensland', [['Brisbane', -27.4698, 153.0251]], 'Australia/Brisbane'],
      ['Western Australia', [['Perth', -31.9505, 115.8605]], 'Australia/Perth'],
    ],
  },
  {
    code: 'CA',
    name: 'Canada',
    zone: 'America/Toronto',
    language: 'en',
    areas: [
      [
        'Ontario',
        [
          ['Toronto', 43.6532, -79.3832],
          ['Ottawa', 45.4215, -75.6972],
        ],
      ],
      [
        'Quebec',
        [
          ['Montreal', 45.5017, -73.5673],
          ['Quebec City', 46.8139, -71.208],
        ],
      ],
      ['British Columbia', [['Vancouver', 49.2827, -123.1207], ['Victoria', 48.4284, -123.3656]], 'America/Vancouver'], // prettier-ignore
    ],
  },
  {
    code: 'FR',
    name: 'France',
    zone: 'Europe/Paris',
    language: 'fr',
    areas: [
      [
        'Île-de-France',
        [
          ['Paris', 48.8566, 2.3522],
          ['Versailles', 48.8049, 2.1204],
        ],
      ],
      [
        'Auvergne-Rhône-Alpes',
        [
          ['Lyon', 45.764, 4.8357],
          ['Grenoble', 45.1885, 5.7245],
        ],
      ],
      [
        "Provence-Alpes-Côte d'Azur",
        [
          ['Marseille', 43.2965, 5.3698],
          ['Nice', 43.7102, 7.262],
        ],
      ],
      [
        'Occitanie',
        [
          ['Toulouse', 43.6047, 1.4442],
          ['Montpellier', 43.6108, 3.8767],
        ],
      ],
    ],
  },
  {
    code: 'DE',
    name: 'Germany',
    zone: 'Europe/Berlin',
    language: 'de',
    areas: [
      ['Berlin', [['Berlin', 52.52, 13.405]]],
      [
        'Bavaria',
        [
          ['Munich', 48.1351, 11.582],
          ['Nuremberg', 49.4521, 11.0767],
        ],
      ],
      ['Hamburg', [['Hamburg', 53.5511, 9.9937]]],
      [
        'North Rhine-Westphalia',
        [
          ['Cologne', 50.9375, 6.9603],
          ['Düsseldorf', 51.2277, 6.7735],
        ],
      ],
    ],
  },
  {
    code: 'US',
    name: 'United States',
    zone: 'America/New_York',
    language: 'en',
    areas: [
      [
        'New York',
        [
          ['New York City', 40.7128, -74.006],
          ['Buffalo', 42.8864, -78.8784],
        ],
      ],
      ['California', [['Los Angeles', 34.0522, -118.2437], ['San Francisco', 37.7749, -122.4194], ['San Diego', 32.7157, -117.1611]], 'America/Los_Angeles'], // prettier-ignore
      ['Illinois', [['Chicago', 41.8781, -87.6298]], 'America/Chicago'],
      [
        'Texas',
        [
          ['Austin', 30.2672, -97.7431],
          ['Houston', 29.7604, -95.3698],
        ],
        'America/Chicago',
      ],
    ],
  },
  {
    code: 'BR',
    name: 'Brazil',
    zone: 'America/Sao_Paulo',
    language: 'pt',
    areas: [
      [
        'São Paulo',
        [
          ['São Paulo', -23.5505, -46.6333],
          ['Campinas', -22.9099, -47.0626],
        ],
      ],
      ['Rio de Janeiro', [['Rio de Janeiro', -22.9068, -43.1729]]],
    ],
  },
  {
    code: 'ES',
    name: 'Spain',
    zone: 'Europe/Madrid',
    language: 'es',
    areas: [
      ['Community of Madrid', [['Madrid', 40.4168, -3.7038]]],
      [
        'Catalonia',
        [
          ['Barcelona', 41.3851, 2.1734],
          ['Girona', 41.9794, 2.8214],
        ],
      ],
      [
        'Andalusia',
        [
          ['Seville', 37.3891, -5.9845],
          ['Málaga', 36.7213, -4.4214],
        ],
      ],
      ['Valencian Community', [['Valencia', 39.4699, -0.3763]]],
    ],
  },
  {
    code: 'NL',
    name: 'Netherlands',
    zone: 'Europe/Amsterdam',
    language: 'nl',
    areas: [
      [
        'North Holland',
        [
          ['Amsterdam', 52.3676, 4.9041],
          ['Haarlem', 52.3874, 4.6462],
        ],
      ],
      [
        'South Holland',
        [
          ['Rotterdam', 51.9244, 4.4777],
          ['The Hague', 52.0705, 4.3007],
        ],
      ],
      ['Utrecht', [['Utrecht', 52.0907, 5.1214]]],
    ],
  },
  {
    code: 'RO',
    name: 'Romania',
    zone: 'Europe/Bucharest',
    language: 'ro',
    areas: [
      ['Bucharest', [['Bucharest', 44.4268, 26.1025]]],
      ['Cluj', [['Cluj-Napoca', 46.7712, 23.6236]]],
      ['Timiș', [['Timișoara', 45.7489, 21.2087]]],
    ],
  },
  { code: 'AT', name: 'Austria', zone: 'Europe/Vienna', language: 'de', areas: [['Vienna', [['Vienna', 48.2082, 16.3738]]], ['Salzburg', [['Salzburg', 47.8095, 13.055]]]] }, // prettier-ignore
  { code: 'BE', name: 'Belgium', zone: 'Europe/Brussels', language: 'fr', areas: [['Brussels', [['Brussels', 50.8503, 4.3517]]], ['Flanders', [['Antwerp', 51.2194, 4.4025], ['Ghent', 51.0543, 3.7174]]]] }, // prettier-ignore
  { code: 'CH', name: 'Switzerland', zone: 'Europe/Zurich', language: 'de', areas: [['Zürich', [['Zürich', 47.3769, 8.5417]]], ['Geneva', [['Geneva', 46.2044, 6.1432]]]] }, // prettier-ignore
  { code: 'PL', name: 'Poland', zone: 'Europe/Warsaw', language: 'pl', areas: [['Masovia', [['Warsaw', 52.2297, 21.0122]]], ['Lesser Poland', [['Kraków', 50.0647, 19.945]]]] }, // prettier-ignore
  { code: 'PT', name: 'Portugal', zone: 'Europe/Lisbon', language: 'pt', areas: [['Lisbon', [['Lisbon', 38.7223, -9.1393]]], ['Porto', [['Porto', 41.1579, -8.6291]]]] }, // prettier-ignore
  { code: 'SE', name: 'Sweden', zone: 'Europe/Stockholm', language: 'sv', areas: [['Stockholm', [['Stockholm', 59.3293, 18.0686]]], ['Västra Götaland', [['Gothenburg', 57.7089, 11.9746]]]] }, // prettier-ignore
  { code: 'NO', name: 'Norway', zone: 'Europe/Oslo', language: 'no', areas: [['Oslo', [['Oslo', 59.9139, 10.7522]]]] }, // prettier-ignore
  { code: 'IE', name: 'Ireland', zone: 'Europe/Dublin', language: 'en', areas: [['Leinster', [['Dublin', 53.3498, -6.2603]]], ['Munster', [['Cork', 51.8985, -8.4756]]]] }, // prettier-ignore
  { code: 'NZ', name: 'New Zealand', zone: 'Pacific/Auckland', language: 'en', areas: [['Auckland', [['Auckland', -36.8485, 174.7633]]], ['Wellington', [['Wellington', -41.2865, 174.7762]]]] }, // prettier-ignore
  { code: 'ZA', name: 'South Africa', zone: 'Africa/Johannesburg', language: 'en', areas: [['Gauteng', [['Johannesburg', -26.2041, 28.0473]]], ['Western Cape', [['Cape Town', -33.9249, 18.4241]]]] }, // prettier-ignore
  { code: 'JP', name: 'Japan', zone: 'Asia/Tokyo', language: 'ja', areas: [['Tokyo', [['Tokyo', 35.6762, 139.6503]]], ['Osaka', [['Osaka', 34.6937, 135.5023]]]] }, // prettier-ignore
  { code: 'MX', name: 'Mexico', zone: 'America/Mexico_City', language: 'es', areas: [['Mexico City', [['Mexico City', 19.4326, -99.1332]]], ['Jalisco', [['Guadalajara', 20.6597, -103.3496]]]] }, // prettier-ignore
  { code: 'AR', name: 'Argentina', zone: 'America/Argentina/Buenos_Aires', language: 'es', areas: [['Buenos Aires', [['Buenos Aires', -34.6037, -58.3816]]]] }, // prettier-ignore
  { code: 'GR', name: 'Greece', zone: 'Europe/Athens', language: 'el', areas: [['Attica', [['Athens', 37.9838, 23.7275]]], ['Central Macedonia', [['Thessaloniki', 40.6401, 22.9444]]]] }, // prettier-ignore
  { code: 'CZ', name: 'Czechia', zone: 'Europe/Prague', language: 'cs', areas: [['Prague', [['Prague', 50.0755, 14.4378]]], ['South Moravia', [['Brno', 49.1951, 16.6068]]]] }, // prettier-ignore
  { code: 'HU', name: 'Hungary', zone: 'Europe/Budapest', language: 'hu', areas: [['Budapest', [['Budapest', 47.4979, 19.0402]]]] }, // prettier-ignore
]

/** Classes in the cities a demo opens first, so their lists run past the fold. */
const BUSY_CITIES: Record<string, number> = { Cambridge: 13, London: 10 }

const TITLES = [
  'Weekly Meditation',
  'Evening Meditation',
  'Meditation for Beginners',
  'Lunchtime Meditation',
  'Morning Meditation',
  'Introduction to Meditation',
  'Meditation and Self-Discovery',
  'Community Meditation',
]
const STREETS = ['Market Street', 'Park Road', 'Church Lane', 'Station Road', 'High Street', 'Garden Avenue', 'Mill Road'] // prettier-ignore
const STARTS = [
  [7, 0],
  [9, 30],
  [12, 30],
  [18, 0],
  [19, 0],
  [19, 30],
] as const

// ── The region tree ─────────────────────────────────────────────────────────────

type DemoNode = (typeof regionNodes)[number]

const nodes: DemoNode[] = [...regionNodes]
let nextRegionId = 60_000

const kebab = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** The fixtures' own node where one already sits there, so its classes join the demo's. */
function place(
  name: string,
  level: DemoNode['level'],
  parent: DemoNode | null,
  slug = kebab(name),
): DemoNode {
  const existing = regionNodes.find(
    (node) => node.slug === slug && node.level === level && node.parent === (parent?.id ?? null),
  )

  if (existing) return existing

  // Slugs are one namespace across the tree, as SahajCloud's are: a city named for its region
  // takes the country's code.
  const unique = nodes.some((node) => node.slug === slug)
    ? `${slug}-${parent?.webPath.split('/')[1] ?? 'x'}`
    : slug
  const node: DemoNode = {
    id: nextRegionId++,
    slug: unique,
    name,
    subtitle: null,
    level,
    parent: parent?.id ?? null,
    webPath: `${parent?.webPath ?? ''}/${unique}`,
    webUrl: null,
  }

  nodes.push(node)

  return node
}

// ── The classes ─────────────────────────────────────────────────────────────────

const features: Json[] = []
const titles: { id: number; title: string }[] = []
const docs: Record<string, Json> = {}
const template = sahajCloud.events[String(SAHAJCLOUD_EVENT.id)] as Record<string, Json>

const now = DateTime.now()

/** The next time `weekday` comes round at `start`, in `zone`, strictly after now. */
function nextAt(zone: string, weekday: number, [hour, minute]: readonly [number, number]) {
  const today = now.setZone(zone).set({ hour, minute, second: 0, millisecond: 0 })
  const at = today.plus({ days: (weekday - today.weekday + 7) % 7 })

  return at <= now ? at.plus({ weeks: 1 }) : at
}

/**
 * Class `n`. Most are weekly classes already running; every sixth is an eight-session course
 * starting soon, and every seventeenth is full, so the list shows each state a card can.
 */
function addClass(n: number, country: Country, zone: string, region: DemoNode, city?: City) {
  const id = 20_000 + n
  const weekday = (n % 7) + 1
  const start = STARTS[n % STARTS.length]
  const next = nextAt(zone, weekday, start)
  const course = n % 6 === 5
  const first = course ? next.plus({ weeks: 1 + (n % 3) }) : next.minus({ weeks: 13 })
  const dates = course ? [first, first.plus({ weeks: 1 })] : [next, next.plus({ weeks: 1 })]
  const title = city ? TITLES[n % TITLES.length] : 'Online Meditation'
  const jitter = ((n * 37) % 21) / 1000 - 0.01
  const address = city && {
    street: `${10 + ((n * 7) % 90)} ${STREETS[n % STREETS.length]}`,
    city: city[0],
    country: country.code,
    latitude: city[1] + jitter,
    longitude: city[2] - jitter,
  }
  const { language } = country
  const properties = {
    id,
    eventType: city ? 'offline' : 'online',
    languages: n % 4 === 0 && language !== 'en' ? [language, 'en'] : [language],
    inactive: false,
    address: address ?? null,
    schedule: {
      firstDate: first.toUTC().toISO(),
      firstDate_tz: zone,
      endTime: first.plus({ minutes: n % 2 ? 60 : 90 }).toFormat('HH:mm'),
      recurrenceType: 'WEEKLY',
      interval: 1,
      weekdays: [WEEKDAY_CODES[weekday - 1]],
      ...(course && { endingType: 'count', count: 8 }),
      upcomingDates: dates.map((date) => date.toUTC().toISO()),
    },
    region: regionRefOf(region),
    registrationsFull: n % 17 === 16,
    verificationStage: null,
    webPath: `${region.webPath}/${id}`,
  }

  features.push(
    toJson({
      type: 'Feature',
      id,
      geometry: address ? { type: 'Point', coordinates: [address.longitude, address.latitude] } : null, // prettier-ignore
      properties,
    }),
  )
  titles.push({ id, title })
  docs[String(id)] = toJson({ ...template, ...properties, title, webUrl: null })
}

let n = 0

for (const [index, country] of COUNTRIES.entries()) {
  const countryNode = place(country.name, 'country', null, country.code.toLowerCase())

  for (const [areaName, cities, zone = country.zone] of country.areas) {
    const area = place(areaName, 'region', countryNode)

    for (const city of cities) {
      const cityNode = place(city[0], 'city', area)
      const count = BUSY_CITIES[city[0]] ?? 2 + (n % 4)

      for (let i = 0; i < count; i++) addClass(n++, country, zone, cityNode, city)
    }
  }

  // Every third country also teaches online, which rolls up at every level of its tree.
  if (index % 3 === 0) addClass(n++, country, country.zone, countryNode)
}

// ── The atlas ───────────────────────────────────────────────────────────────────

const allFeatures = [...(sahajCloud.feed as { features: Json[] }).features, ...features]

/**
 * A class's pictures are the mocks' own. The fixtures' are relative, as SahajCloud serves a file it
 * holds, so a story would ask its own origin for a file nobody serves.
 */
const withStoryImages = (doc: Json) =>
  toJson({
    ...(doc as object),
    images: mockEventImages.map(({ url, alt }, index) => ({ id: index + 1, url, alt })),
  })

/** The SahajCloud fixtures, with the bigger atlas in place of its tree, its feed and its classes. */
export const demo: typeof sahajCloud = {
  ...sahajCloud,
  // A report form, so the stories show every way into it: the settings menu's "Report an issue"
  // and a class page's "Report incorrect class details".
  atlasConfig: toJson({ id: 1, availableLocales: ['en'], reportIssueForm: mockReportForm.id }),
  forms: { [mockReportForm.id]: toJson(mockReportForm) },
  regions: paginated(nodes),
  feed: toJson({
    type: 'FeatureCollection',
    features: allFeatures,
    ...onePage(allFeatures.length),
  }),
  eventTitles: paginated([...(sahajCloud.eventTitles as { docs: Json[] }).docs, ...titles]),
  events: Object.fromEntries(
    Object.entries({ ...sahajCloud.events, ...docs }).map(([id, doc]) => [
      id,
      withStoryImages(doc),
    ]),
  ),
}
