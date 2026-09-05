/**
 * Minimal Lexical → HTML / plain-text serializer for event descriptions.
 *
 * SahajCloud's event `description` richText editor enables only italic, H3, and
 * links, so this renders just those (plus paragraphs and line breaks), instead of
 * pulling the full `@payloadcms/richtext-lexical` HTML converter into this public
 * widget bundle. `lexicalToHtml` output is sanitized through DOMPurify at the
 * render site (`EventPanel`). `lexicalToText` feeds plain-text meta/OG tags.
 */

// Lexical text-format bitmask — only the flags the editor can produce.
const FORMAT_BOLD = 1
const FORMAT_ITALIC = 1 << 1

type LexicalNode = {
  type?: string
  tag?: string
  text?: string
  format?: number | string
  url?: string
  fields?: { url?: string | null } | null
  children?: LexicalNode[]
  [k: string]: unknown
}

type LexicalDocument = { root?: LexicalNode }

// Narrow the open `description` shape (validated only structurally by zod) to the
// nodes we serialize.
const asDocument = (doc: unknown): LexicalDocument | null =>
  doc && typeof doc === 'object' && 'root' in doc ? (doc as LexicalDocument) : null

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const renderText = (node: LexicalNode): string => {
  let html = escapeHtml(node.text ?? '')
  const format = typeof node.format === 'number' ? node.format : 0

  if (format & FORMAT_BOLD) html = `<strong>${html}</strong>`
  if (format & FORMAT_ITALIC) html = `<em>${html}</em>`

  return html
}

const renderChildren = (node: LexicalNode): string => (node.children ?? []).map(renderNode).join('')

const renderNode = (node: LexicalNode): string => {
  switch (node.type) {
    case 'text':
      return renderText(node)
    case 'linebreak':
      return '<br>'
    case 'paragraph': {
      const inner = renderChildren(node)

      return inner ? `<p>${inner}</p>` : ''
    }
    case 'heading': {
      const tag = /^h[1-6]$/.test(node.tag ?? '') ? (node.tag as string) : 'h3'

      return `<${tag}>${renderChildren(node)}</${tag}>`
    }
    case 'list': {
      const tag = node.tag === 'ol' ? 'ol' : 'ul'

      return `<${tag}>${renderChildren(node)}</${tag}>`
    }
    case 'listitem':
      return `<li>${renderChildren(node)}</li>`
    case 'link': {
      const url = node.fields?.url ?? node.url ?? ''

      return url ? `<a href="${escapeHtml(url)}">${renderChildren(node)}</a>` : renderChildren(node)
    }
    default:
      return renderChildren(node)
  }
}

/** Serialize a Lexical document to a sanitizable HTML string (empty when absent). */
export const lexicalToHtml = (doc: unknown): string => {
  const root = asDocument(doc)?.root

  if (!root) return ''

  return renderChildren(root).trim()
}

const collectText = (node: LexicalNode): string => {
  if (node.type === 'text') return node.text ?? ''
  const inner = (node.children ?? []).map(collectText).join('')

  // Block-level nodes get a trailing newline so they do not run together.
  return ['paragraph', 'heading', 'listitem'].includes(node.type ?? '') ? `${inner}\n` : inner
}

/** Flatten a Lexical document to plain text (for meta/OG descriptions). */
export const lexicalToText = (doc: unknown): string => {
  const root = asDocument(doc)?.root

  if (!root) return ''

  return collectText(root)
    .replace(/\n{2,}/g, '\n')
    .trim()
}
