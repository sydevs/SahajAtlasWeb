// Region-aware share-target ordering.
//
// A meditation event is shared globally: a viewer in Russia reaches for VK or
// Telegram, one in Japan for LINE, one in India for WhatsApp — so the share grid
// is ordered to the *viewer's* country rather than showing everyone the same
// Western five. No npm package ships per-country platform preferences, so this
// map is hand-maintained: an ISO alpha-2 code → the platforms that country
// actually uses, most-popular first, seeded from DataReportal's "Digital 2026".
// `platformsForCountry` falls back to a broad default for any unseeded/unknown
// code. Only platforms react-share can compose a web-share URL for appear here;
// native-only apps (KakaoTalk, WeChat, Zalo, SMS) are reached through the OS
// share sheet (see `useWebShare`), which is the ultimate per-device filter.

export type PlatformKey =
  | 'whatsapp'
  | 'telegram'
  | 'facebook'
  | 'x'
  | 'linkedin'
  | 'reddit'
  | 'email'
  | 'vk'
  | 'ok'
  | 'line'
  | 'viber'
  | 'weibo'

// The universal fallback: six broadly-used targets for a global audience, with
// email last as the lowest-common-denominator option that always works. Kept to
// six (like every country list below) so the share grid stays a single balanced
// row in the drawer — Reddit is anglophone-skewed, so it's left to the country
// lists that want it rather than the universal default.
export const DEFAULT_PLATFORMS: PlatformKey[] = [
  'whatsapp',
  'facebook',
  'x',
  'telegram',
  'linkedin',
  'email',
]

// ISO alpha-2 (uppercase) → ordered platforms. Lookups uppercase the input first,
// so casing at the call site doesn't matter.
export const PLATFORMS_BY_COUNTRY: Record<string, PlatformKey[]> = {
  // Russia & CIS — VK and OK.ru dominate; Telegram and Viber heavily used.
  RU: ['vk', 'ok', 'telegram', 'whatsapp', 'viber', 'x'],
  BY: ['vk', 'ok', 'telegram', 'viber', 'whatsapp'],
  KZ: ['vk', 'whatsapp', 'telegram', 'ok', 'x'],
  UA: ['telegram', 'viber', 'facebook', 'whatsapp', 'x'],
  // East Asia — LINE across Japan/Taiwan/Thailand; Weibo in China (WeChat is
  // native-only, so it isn't in this web grid).
  JP: ['line', 'x', 'facebook', 'whatsapp', 'email'],
  TW: ['line', 'facebook', 'x', 'whatsapp', 'telegram'],
  TH: ['line', 'facebook', 'whatsapp', 'x', 'telegram'],
  KR: ['line', 'x', 'facebook', 'whatsapp', 'email'],
  CN: ['weibo', 'whatsapp', 'telegram', 'line'],
  // South & Southeast Asia — WhatsApp-first.
  IN: ['whatsapp', 'telegram', 'facebook', 'x', 'linkedin'],
  ID: ['whatsapp', 'facebook', 'telegram', 'line', 'x'],
  PK: ['whatsapp', 'facebook', 'telegram', 'x'],
  BD: ['whatsapp', 'facebook', 'telegram', 'x'],
  VN: ['facebook', 'whatsapp', 'telegram', 'x'],
  // Middle East — WhatsApp plus Telegram; X strong in the Gulf.
  TR: ['whatsapp', 'telegram', 'x', 'facebook'],
  SA: ['whatsapp', 'x', 'telegram', 'facebook'],
  AE: ['whatsapp', 'x', 'telegram', 'facebook'],
  IR: ['telegram', 'whatsapp', 'x'],
  // Europe — WhatsApp-led, Facebook and Telegram common; email for the formal tail.
  DE: ['whatsapp', 'facebook', 'telegram', 'x', 'linkedin', 'email'],
  FR: ['whatsapp', 'facebook', 'x', 'telegram', 'linkedin', 'email'],
  ES: ['whatsapp', 'facebook', 'x', 'telegram', 'email'],
  IT: ['whatsapp', 'facebook', 'telegram', 'x', 'email'],
  NL: ['whatsapp', 'facebook', 'x', 'linkedin', 'email'],
  GB: ['whatsapp', 'facebook', 'x', 'reddit', 'linkedin', 'email'],
  PL: ['facebook', 'whatsapp', 'x', 'telegram', 'email'],
  CZ: ['facebook', 'whatsapp', 'telegram', 'x', 'email'],
  HU: ['facebook', 'whatsapp', 'telegram', 'x', 'email'],
  // Americas — X/Facebook/WhatsApp in the north, WhatsApp dominant in Latin America.
  US: ['x', 'facebook', 'whatsapp', 'reddit', 'linkedin', 'email'],
  CA: ['facebook', 'whatsapp', 'x', 'reddit', 'linkedin', 'email'],
  BR: ['whatsapp', 'x', 'facebook', 'telegram', 'reddit'],
  MX: ['whatsapp', 'facebook', 'x', 'telegram'],
  AR: ['whatsapp', 'facebook', 'x', 'telegram'],
  // Africa — WhatsApp-first, Facebook and Telegram behind it.
  NG: ['whatsapp', 'facebook', 'x', 'telegram'],
  ZA: ['whatsapp', 'facebook', 'x', 'telegram'],
  KE: ['whatsapp', 'facebook', 'x', 'telegram'],
  EG: ['whatsapp', 'facebook', 'telegram', 'x'],
  // Oceania
  AU: ['facebook', 'whatsapp', 'x', 'reddit', 'linkedin', 'email'],
  NZ: ['facebook', 'whatsapp', 'x', 'reddit', 'email'],
}

/**
 * The ordered share platforms for a viewer's country (ISO alpha-2,
 * case-insensitive). Returns the seeded list for a known country, otherwise
 * `DEFAULT_PLATFORMS` — including for an unknown, empty, or absent code, so
 * callers can pass a maybe-undefined code straight through.
 */
export function platformsForCountry(code?: string | null): PlatformKey[] {
  if (!code) return DEFAULT_PLATFORMS

  return PLATFORMS_BY_COUNTRY[code.toUpperCase()] ?? DEFAULT_PLATFORMS
}
