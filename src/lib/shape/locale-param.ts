/**
 * The widget's language, as it appears on the host page's own URL.
 *
 * `?locale=` was already half of a contract: i18next's detector reads it (`lookupQuerystring`
 * in `config/i18n-options.ts`), and `docs/embedding.md` documents it to integrators. Nothing
 * ever WROTE it, so picking a language from the settings menu changed the widget and left the
 * address bar describing the page as it was before — nothing to copy, nothing to reload into.
 *
 * This is the other half. It is the second and last top-level parameter the widget ever WRITES to
 * a host's URL, beside `atlas`; both `hrefFor` and `pathHrefFor` preserve parameters they do not
 * own, so once written it survives every subsequent in-widget navigation and rides along in
 * anything the visitor copies.
 *
 * ⚠ **"Writes" is doing real work in that sentence** — `feedback-param.ts` (#164) added a third
 * top-level name the widget knows about, and it is the mirror image of this one: read once on
 * arrival and then REMOVED, never written. Both facts matter to a host, which is why
 * `docs/embedding.md` documents them together and separately.
 *
 * ⚠ **Imports nothing from `config/`, and `pageLocaleOverride` takes the supported set as an
 * argument for that reason.** `config/i18n-options.ts` imports `LOCALE_PARAM` from here, so
 * reaching back for `supportedLanguages` would close a cycle — and one that typecheck cannot
 * see: it would surface as a TDZ `ReferenceError` at boot, and only in whichever load order the
 * bundler happened to pick. Every other module in `lib/shape` is pure for the same reason.
 */

/**
 * The parameter name, defined once.
 *
 * `i18n-options.ts` imports it for `lookupQuerystring` rather than repeating the string, so the
 * reader and the writer cannot drift — the failure mode if they did is silent in both
 * directions: a language that never reloads, or a parameter nobody reads.
 */
export const LOCALE_PARAM = 'locale'

/** The absolute URL for `href` carrying `locale`, or `''` if it will not parse. */
export function localeHref(href: string, locale: string): string {
  try {
    const url = new URL(href)

    url.searchParams.set(LOCALE_PARAM, locale)

    return url.toString()
  } catch {
    // A page whose URL will not parse cannot be written back to. The caller does nothing, which
    // costs the reload-persistence and no more — the same degradation `hrefFor` produces.
    return ''
  }
}

/**
 * Publish the viewer's chosen language onto the page URL.
 *
 * Three things about how this is written matter:
 *
 *  - **`replaceState`, not push.** A language is a preference, not a place. Pushing would put an
 *    entry in the host's own history whose only effect on Back is to change the language again.
 *  - **`history.state` is passed through verbatim**, which keeps the atlas history's `__sy_atlas`
 *    slice — the entry key and depth that `rememberCamera` and the drawer's dismissal read.
 *    Dropping it would make the next X climb to the structural parent instead of going back.
 *  - **it does not go through `AtlasRouter`.** The router mints a route entry for every write,
 *    and this is not a route change. Writing behind the history's back is safe precisely because
 *    `?atlas=` is untouched, and that is the only parameter the history re-reads.
 *
 * Callers must skip this in memory routing, where the widget's route is deliberately not in a URL
 * at all — `WidgetMode.linkable` is that question, already decided once at mount.
 */
export function publishLocale(locale: string, win: Window = window): void {
  const href = localeHref(win.location.href, locale)

  if (!href || href === win.location.href) return

  try {
    win.history.replaceState(win.history.state, '', href)
  } catch {
    // A document that refuses replaceState keeps the language for this session and simply
    // doesn't persist it — the same posture the atlas history takes on a refused write.
  }
}

/**
 * The language the PAGE URL asks for, if it names one this widget can actually render.
 *
 * `App` applies the `locale` given on the embed's script URL once at mount, over whatever
 * detection resolved. That is right for a host declaring the language of their page — and wrong
 * once a viewer has chosen for themselves and we have written that choice into a link, because
 * reloading it, or opening it from someone who shared it, would silently revert.
 *
 * ⚠ **Resolvable, not merely present.** A junk `?locale=zz` falls back to English through
 * `supportedLngs`, so treating its mere presence as a choice would suppress the host's own
 * `locale=fr` in favour of English — a worse answer than either party asked for. Regional tags
 * resolve by base tag the same way i18next does (`de-DE` → `de`), so a link that survives a
 * round trip through a browser's language list still counts.
 */
export function pageLocaleOverride(
  search: string,
  supported: readonly string[],
): string | undefined {
  const raw = new URLSearchParams(search).get(LOCALE_PARAM)?.trim()

  if (!raw) return undefined

  const base = raw.split('-')[0]

  return supported.find((code) => code === raw || code.split('-')[0] === base)
}
