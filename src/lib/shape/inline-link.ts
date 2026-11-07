/**
 * Splits a translated sentence around one `<link>…</link>` span, so a translation decides where
 * a link sits in it and what it says. Text with no span, or a malformed one, is returned whole,
 * and the caller renders it as plain text.
 *
 * The markup is ours, not HTML: nothing in the string is ever rendered as markup, so a span is the
 * only thing a translation can turn into a link, and only to the href the caller supplies.
 */
export const splitInlineLink = (
  text: string,
): { before: string; link: string; after: string } | null => {
  const match = /^([\s\S]*?)<link>([\s\S]+?)<\/link>([\s\S]*)$/.exec(text)

  if (!match) return null

  const [, before = '', link = '', after = ''] = match

  return link.trim() ? { before, link, after } : null
}
