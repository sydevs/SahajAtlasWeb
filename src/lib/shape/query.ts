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
 * ⚠ **`routing.ts` does NOT use this yet, deliberately.** `hrefFor` / `pathHrefFor` write `?atlas=`
 * through `searchParams.set` and then repair the damage with a private `readable()` pass over the
 * whole query. That recovers `/` and `,` but not a host's `%20`, so this module is strictly
 * stronger — moving them onto it is a follow-up, kept out of the change that introduced this
 * because those two are the routing core and their round trip is pinned by a suite of its own.
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
 * Both are legal unencoded in a query component and neither can be confused with the `&` and `=`
 * that separate pairs, so restoring them cannot change how the pair parses — it only keeps a
 * shared link legible, which is the same judgement `routeToParam` makes about `?atlas=`.
 */
function encodeValue(value: string): string {
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
 * switching language twice) does not shuffle the host's URL; a repeat of the same name collapses to
 * the one we wrote, as `URLSearchParams.set` would. Appends at the end where it is new.
 */
export function searchWith(search: string, name: string, value: string): string {
  const written = `${encodeValue(name)}=${encodeValue(value)}`
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
