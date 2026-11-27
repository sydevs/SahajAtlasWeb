import { createInstance } from 'i18next'

import { bootResources, i18nSharedOptions } from '@/config/i18n-options'

/**
 * The widget's boot English through a real i18next instance, for a spec whose copy takes a plural
 * form (`_one` / `_other`), which a dotted-path lookup into the snapshot cannot pick.
 */
export async function englishT() {
  const i18n = createInstance()

  await i18n.init({ ...i18nSharedOptions, lng: 'en', resources: bootResources })

  return i18n.t
}
