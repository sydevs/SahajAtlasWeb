import { describe, it, expect } from 'vitest'

import { ClientSchema } from './client'

const client = {
  id: 7,
  name: 'Host Site',
  locale: 'en',
  color1: '#000000',
  allowedDomains: 'host.example\nwww.host.example',
  clientId: 'sahaj-atlas-client',
  region: { id: 28, slug: 'belgium', level: 'country', name: 'Belgium' },
}

describe('ClientSchema', () => {
  it('parses a client with a resolved home region', () => {
    const parsed = ClientSchema.parse(client)

    expect(parsed.locale).toBe('en')
    expect(parsed.region).toMatchObject({ slug: 'belgium', level: 'country' })
  })

  it('allows a null locale and an unset region', () => {
    const parsed = ClientSchema.parse({ id: 7, name: 'Host Site', locale: null })

    expect(parsed.locale).toBeNull()
  })

  it('rejects a missing id', () => {
    expect(() => ClientSchema.parse({ name: 'Host Site', locale: 'en' })).toThrow()
  })

  /**
   * `legacyConfig` was dropped here when SahajCloud removed the field (#153), and a field we no
   * longer declare must not be able to fail the parse that bootstraps the whole widget. The
   * schema is non-strict, so an unknown key is stripped — which is also why the stale
   * `select[legacyConfig]=true` this shipped with kept answering 200 the whole time.
   */
  it('ignores a field it no longer declares rather than refusing the document', () => {
    const parsed = ClientSchema.parse({ ...client, legacyConfig: { default_view: 'map' } })

    expect(parsed).not.toHaveProperty('legacyConfig')
    expect(parsed.clientId).toBe('sahaj-atlas-client')
  })
})
