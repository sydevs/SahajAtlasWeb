import { describe, it, expect } from 'vitest'

import { ClientSchema } from './client'

const client = {
  id: 7,
  title: 'Host Site',
  color1: '#000000',
  allowedDomains: 'host.example\nwww.host.example',
  clientId: 'sahaj-atlas-client',
  region: { id: 28, slug: 'belgium', level: 'country', name: 'Belgium' },
}

describe('ClientSchema', () => {
  it('parses a client with a resolved home region', () => {
    const parsed = ClientSchema.parse(client)

    expect(parsed.region).toMatchObject({ slug: 'belgium', level: 'country' })
  })

  it('allows an unset region', () => {
    expect(ClientSchema.parse({ id: 7, title: 'Host Site' }).region).toBeUndefined()
  })

  it('rejects a missing id', () => {
    expect(() => ClientSchema.parse({ title: 'Host Site' })).toThrow()
  })

  /**
   * The public name is `title`. The schema named `name` for its whole life, which the synced
   * `Client` has never had, so `/clients/me` answered none and the JSON-LD organizer it fed was
   * never emitted.
   */
  it('reads the public name from title, and strips a name key', () => {
    const parsed = ClientSchema.parse({ ...client, name: 'Internal Label' })

    expect(parsed.title).toBe('Host Site')
    expect(parsed).not.toHaveProperty('name')
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
