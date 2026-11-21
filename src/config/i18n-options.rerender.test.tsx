// @vitest-environment jsdom
import { createInstance } from 'i18next'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next'
import { describe, expect, it } from 'vitest'

import { i18nSharedOptions } from './i18n-options'

/**
 * jsdom, because the subject is a re-render: `applyLocale` ADDS a locale's bundle after init,
 * with no language change, and a component already on screen has to pick it up.
 *
 * ⚠ The instance here is built the way `.ladle/i18n.ts` builds Ladle's, from the shared options
 * alone. react-i18next 18 reads its `react` options off each instance, so an option set only in
 * `config/i18n.ts` reaches the app and silently skips every story.
 */
function Greeting() {
  const { t } = useTranslation()

  return <>{t('greeting' as never)}</>
}

describe('i18nSharedOptions', () => {
  it('re-renders a mounted component when a bundle lands for the active language', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    const i18n = createInstance()

    await i18n.use(initReactI18next).init({
      ...i18nSharedOptions,
      lng: 'en',
      resources: { en: { translation: { greeting: 'Hello' } } },
    })

    const container = document.createElement('div')

    document.body.append(container)

    const root = createRoot(container)

    await act(async () =>
      root.render(
        <I18nextProvider i18n={i18n}>
          <Greeting />
        </I18nextProvider>,
      ),
    )

    expect(container.textContent).toBe('Hello')

    await act(async () => {
      i18n.addResourceBundle('en', 'translation', { greeting: 'Hello, from the CMS' }, true, true)
    })

    expect(container.textContent).toBe('Hello, from the CMS')

    await act(async () => root.unmount())
    container.remove()
  })
})
