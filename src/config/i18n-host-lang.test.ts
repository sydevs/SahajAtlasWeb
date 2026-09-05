// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { hostHtmlLangDetector, i18nDetectionOptions } from './i18n-options'

import { WIDGET_SCOPE_CLASS } from '@/lib/scope'

/**
 * This tests `<html lang>` as a language signal, and the one document it must refuse to read.
 *
 * This uses jsdom, because every branch is a question about a real `document.documentElement`: what its `lang` says, and whether it is OUR shell or a host's page.
 */
afterEach(() => {
  document.documentElement.removeAttribute('lang')
  document.documentElement.classList.remove(WIDGET_SCOPE_CLASS)
})

describe('hostHtmlLangDetector', () => {
  it('reads a host page’s declared language', () => {
    document.documentElement.setAttribute('lang', 'nl')

    expect(hostHtmlLangDetector.lookup()).toBe('nl')
  })

  it('is absent when the host declares nothing', () => {
    expect(hostHtmlLangDetector.lookup()).toBeUndefined()
  })

  it('ignores a blank or whitespace lang rather than resolving it', () => {
    document.documentElement.setAttribute('lang', '   ')

    expect(hostHtmlLangDetector.lookup()).toBeUndefined()
  })

  /**
   * ⚠ **This is the whole reason this is not i18next's built-in `htmlTag` detector.**
   *
   * Our standalone shell is `<html class="sy-atlas" lang="en">`, a hard-coded placeholder that describes nothing.
   * The built-in detector would read it and pin every standalone visitor to English, silently undoing the browser detection that works today.
   * The scope class marks a document as ours. A host's page never carries it on `<html>`.
   */
  it('refuses to read our OWN shell, which declares a placeholder', () => {
    document.documentElement.classList.add(WIDGET_SCOPE_CLASS)
    document.documentElement.setAttribute('lang', 'en')

    expect(hostHtmlLangDetector.lookup()).toBeUndefined()
  })
})

describe('the detection order', () => {
  // ⚠ A name in `order` that no registered detector answers to is skipped in SILENCE.
  // So this test asserts the two together. Otherwise a rename leaves the entry inert with everything green.
  it('names the detector that is actually registered', () => {
    expect(i18nDetectionOptions.order).toContain(hostHtmlLangDetector.name)
  })

  it('puts the page’s own ?locale= above it, and the browser below', () => {
    const { order } = i18nDetectionOptions

    expect(order.indexOf('querystring')).toBeLessThan(order.indexOf('hostHtmlLang'))
    expect(order.indexOf('hostHtmlLang')).toBeLessThan(order.indexOf('navigator'))
  })
})
