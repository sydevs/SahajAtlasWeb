import { describe, expect, it } from 'vitest'

import { splitInlineLink } from './inline-link'

describe('splitInlineLink', () => {
  it('splits a sentence around its link span', () => {
    expect(splitInlineLink('In accordance with our <link>privacy policy</link>.')).toEqual({
      before: 'In accordance with our ',
      link: 'privacy policy',
      after: '.',
    })
  })

  it('lets a translation put the link first', () => {
    expect(splitInlineLink('<link>Datenschutz</link> gilt.')).toEqual({
      before: '',
      link: 'Datenschutz',
      after: ' gilt.',
    })
  })

  it('leaves text with no span, an unclosed span or an empty one to render whole', () => {
    expect(splitInlineLink('In accordance with our privacy policy.')).toBeNull()
    expect(splitInlineLink('Our <link>privacy policy.')).toBeNull()
    expect(splitInlineLink('Our <link> </link>.')).toBeNull()
  })

  it('links the first span only, leaving any later one as text', () => {
    expect(splitInlineLink('<link>a</link> and <link>b</link>')).toEqual({
      before: '',
      link: 'a',
      after: ' and <link>b</link>',
    })
  })
})
