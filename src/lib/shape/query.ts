/**
 * Editing ONE parameter on a host page's query string, leaving every other pair byte-identical.
 *
 * The widget writes onto URLs it does not own — a host's page carries their parameters, and beside
 * them the one or two the widget claims (`atlas`, `locale`). So every edit here answers the same
 * question: how do you change one pair without touching the rest?
 *
 * ⚠ **`URLSearchParams.set()` / `.delete()` are the obvious answer and they are wrong**, because
 * they re-serialize the WHOLE query rather than editing one pair. Measured, on a URL carrying a
 * route and a host parameter:
 *
 * ```
 * in                  ?atlas=/nl/amsterdam?center=4.9,52.3&keep=a%20b
 * .delete('x')        ?atlas=%2Fnl%2Famsterdam%3Fcenter%3D4.9%2C52.3&keep=a+b
 * searchWithout(…)    ?atlas=/nl/amsterdam?center=4.9,52.3&keep=a%20b
 * ```
 *
 * Two separate losses in that middle line. It undoes `routeToParam`'s deliberate restoration of
 * `/` and `,` — the one thing that has to stay readable in a link somebody copies — and it rewrites
 * `keep=a%20b` to `keep=a+b`, which is a HOST's parameter we have no business touching at all.
 * Both are equivalent to a parser and neither is what the page had.
 *
 * So every edit is surgical: split the raw query on `&`, change only the pairs we claim, rejoin.
 * Assigning the result back through `URL.search` is safe where `searchParams` is not — the query
 * percent-encode set covers only C0 controls, space, `"`, `#`, `<`, `>` and `'`, so `/`, `,`, `=`
 * and an already-encoded `%20` all survive verbatim.
 *
 * **Every parameter the widget writes to a host's URL goes through here**, which is what makes
 * "we touch our pair and nothing else" literally true rather than approximately. `hrefFor` and
 * `pathHrefFor` (`routing.ts`) used to write `?atlas=` with `searchParams.set` and then repair the
 * damage with a `readable()` pass over the whole query. That recovered `/` and `,`, and never
 * recovered a host's `%20`, which `set` had already turned into `+`. `routeToParam` is the
 * route-shaped name for {@link encodeParamValue} and delegates to it, so there is one encoder.
 *
 * ⚠ **`hrefFor` calls `searchWith`, not `hrefWith`, and that is not interchangeable.** The href
 * wrappers answer `''` when the value is already present, because their callers — `publishLocale`
 * and `clearFeedback` — both mean "leave the URL alone" by it. `hrefFor` feeds `createHref` for
 * every `<Link>`, where a link to the route already on screen is the commonest case in the app, so
 * `''` there would blank the href of every self-link. Pinned in `routing.test.ts`.
 *
 * ⚠ **`src/loader/` must NOT import this.** Its one `searchParams.set` stays hand-rolled: a value
 * import across that seam makes a module reachable from both entries, and `pnpm size` fails the
 * build for it (see `src/loader/literals.ts`). The loader writes a probe parameter onto a URL it
 * throws away, so it has nothing to protect anyway.
 *
 * This module is pure — no `window`, no `history`. The callers that touch the address bar are
 * `clearFeedback` (`feedback-param.ts`) and `publishLocale` (`locale-param.ts`).
 */

/**
 * The name half of a raw `a=b` pair, percent-decoded so `%66eedback` compares equal to `feedback`.
 *
 * Decoding matters because the READERS go through `URLSearchParams`, which decodes names — so a
 * link written with an encoded name would be read and then never cleaned up.
 */
function pairName(pair: string): string {
  const raw = pair.split('=')[0]

  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch {
    // A malformed `%` escape is not a name we claim. Compare the raw form instead of throwing:
    // this runs over a host's query string, which we do not control.
    return raw
  }
}

/** The raw `a=b` pairs of a query string, with the leading `?` and any empty pairs dropped. */
function pairsOf(search: string): string[] {
  const raw = search.startsWith('?') ? search.slice(1) : search

  return raw === '' ? [] : raw.split('&').filter((pair) => pair !== '')
}

/** `?`-prefixed, or `''` when nothing survived — the shape `URL.search` itself uses. */
function joinPairs(pairs: string[]): string {
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`
}

/**
 * A value encoded for the query, keeping `/` and `,` readable.
 *
 * Both are legal unencoded in a query component (RFC 3986: `query = *( pchar / "/" / "?" )`) and
 * neither can be confused with the `&` and `=` that separate pairs, so restoring them cannot
 * change how the pair parses — it only keeps a shared link legible.
 *
 * `?` is deliberately **left** encoded. It is legal too, but a raw one inside a value makes it
 * ambiguous at a glance whether a nested query belongs to the widget or to the host.
 *
 * This is the one definition. `routeToParam` (`routing.ts`) is the route-shaped name for it, and
 * delegates here, so the encoding `?atlas=` is written with and the encoding every other parameter
 * is written with cannot drift apart.
 */
export function encodeParamValue(value: string): string {
  return encodeURIComponent(value).replace(/%2F/g, '/').replace(/%2C/g, ',')
}

/**
 * `search` with every pair named in `names` removed, and **every other pair left byte-identical**.
 *
 * Removes each name wherever it appears, including a repeat. A name that merely CONTAINS one of
 * `names` (`user_feedback`) is not a match — the comparison is on the whole decoded name.
 */
export function searchWithout(search: string, ...names: string[]): string {
  return joinPairs(pairsOf(search).filter((pair) => !names.includes(pairName(pair))))
}

/**
 * `search` with `name` set to `value`, and **every other pair left byte-identical**.
 *
 * Replaces the parameter **in place** where it already exists, so a repeated write (a viewer
 * switching language twice) does not shuffle the host's URL. A repeat of the same name collapses to
 * the one we wrote, as `URLSearchParams.set` would. Appends at the end where it is new.
 */
export function searchWith(search: string, name: string, value: string): string {
  const written = `${encodeParamValue(name)}=${encodeParamValue(value)}`
  const pairs = pairsOf(search)
  const at = pairs.findIndex((pair) => pairName(pair) === name)

  if (at === -1) return joinPairs([...pairs, written])

  return joinPairs(
    pairs
      .map((pair, index) => (index === at ? written : pair))
      .filter((pair, index) => index === at || pairName(pair) !== name),
  )
}

/**
 * `href` rewritten by `edit`, or `''` when there is nothing to do.
 *
 * `''` covers both "the edit changed nothing" and "the href will not parse" deliberately: a
 * caller's response to each is the same — leave the URL alone — and collapsing them keeps the one
 * branch at the call site honest rather than inviting a distinction nothing acts on.
 */
function hrefWithSearch(href: string, edit: (search: string) => string): string {
  try {
    const url = new URL(href)
    const next = edit(url.search)

    if (next === url.search) return ''

    url.search = next

    return url.toString()
  } catch {
    return ''
  }
}

/** `href` with every parameter named in `names` removed, or `''` when there is nothing to do. */
export function hrefWithout(href: string, ...names: string[]): string {
  return hrefWithSearch(href, (search) => searchWithout(search, ...names))
}

/** `href` with `name` set to `value`, or `''` when there is nothing to do. */
export function hrefWith(href: string, name: string, value: string): string {
  return hrefWithSearch(href, (search) => searchWith(search, name, value))
}
