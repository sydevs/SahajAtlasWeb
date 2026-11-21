import { describe, it, expect } from 'vitest'

import { lexicalToHtml, lexicalToText, plainTextToLexical } from './lexical'

// Mirrors the SahajCloud event `description` shape (root → paragraph/heading →
// text/link), with the format bitmask the italic-only editor produces.
const doc = {
  root: {
    type: 'root',
    children: [
      {
        type: 'heading',
        tag: 'h3',
        children: [{ type: 'text', text: 'Welcome' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Experience ' },
          { type: 'text', text: 'inner peace', format: 2 },
          { type: 'text', text: ' — ' },
          {
            type: 'link',
            fields: { url: 'https://example.org' },
            children: [{ type: 'text', text: 'learn more' }],
          },
        ],
      },
    ],
  },
}

describe('lexicalToHtml', () => {
  it('renders headings, italic text, and links', () => {
    expect(lexicalToHtml(doc)).toBe(
      '<h3>Welcome</h3><p>Experience <em>inner peace</em> — <a href="https://example.org">learn more</a></p>',
    )
  })

  it('returns an empty string for null/empty documents', () => {
    expect(lexicalToHtml(null)).toBe('')
    expect(lexicalToHtml(undefined)).toBe('')
    expect(lexicalToHtml({ root: { type: 'root', children: [] } })).toBe('')
  })

  it('renders lists with their item wrappers', () => {
    const withList = {
      root: {
        type: 'root',
        children: [
          {
            type: 'list',
            tag: 'ul',
            children: [
              { type: 'listitem', children: [{ type: 'text', text: 'one' }] },
              { type: 'listitem', children: [{ type: 'text', text: 'two' }] },
            ],
          },
        ],
      },
    }

    expect(lexicalToHtml(withList)).toBe('<ul><li>one</li><li>two</li></ul>')
  })

  it('escapes HTML special characters in text', () => {
    const malicious = {
      root: {
        type: 'root',
        children: [{ type: 'paragraph', children: [{ type: 'text', text: '<script>x' }] }],
      },
    }

    expect(lexicalToHtml(malicious)).toBe('<p>&lt;script&gt;x</p>')
  })

  it('drops empty links rather than emitting a bare anchor', () => {
    const noUrl = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'link', fields: { url: null }, children: [{ type: 'text', text: 'x' }] },
            ],
          },
        ],
      },
    }

    expect(lexicalToHtml(noUrl)).toBe('<p>x</p>')
  })
})

describe('lexicalToText', () => {
  it('flattens to plain text across blocks', () => {
    expect(lexicalToText(doc)).toBe('Welcome\nExperience inner peace — learn more')
  })

  it('returns an empty string for null documents', () => {
    expect(lexicalToText(null)).toBe('')
  })
})

describe('plainTextToLexical', () => {
  it('round-trips through lexicalToText, one paragraph per line', () => {
    const written = 'Every Tuesday at seven.\n\nBring a cushion.'

    expect(lexicalToText(plainTextToLexical(written))).toBe(written.replace(/\n+/g, '\n'))
    expect(lexicalToHtml(plainTextToLexical(written))).toBe(
      '<p>Every Tuesday at seven.</p><p>Bring a cushion.</p>',
    )
  })

  it('is null for text with nothing in it', () => {
    expect(plainTextToLexical('   \n  ')).toBeNull()
  })
})
