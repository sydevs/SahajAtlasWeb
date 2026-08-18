import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  READY_ATTR,
  READY_CONTRACT_VERSION,
  clearReadiness,
  publishReadiness,
  readinessMarker,
} from './readiness'

const observed = { routing: 'query', topLevel: true, urlWritable: true } as const

/** The smallest `documentElement` the module touches — the node lane has no DOM. */
function stubDocument() {
  const attributes = new Map<string, string>()
  const documentElement = {
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  }

  vi.stubGlobal('document', { documentElement })

  return attributes
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readinessMarker', () => {
  /**
   * The JSON is a cross-repo contract: SahajCloud's verifier reads these four fields off the
   * rendered page and stores them as the `VerifiedEmbed` a canonical URL is built from. A field
   * renamed here is a verification that silently starts failing there, so the shape is pinned
   * exactly rather than by `toMatchObject`.
   */
  it('carries exactly the four fields the verifier reads', () => {
    expect(readinessMarker(observed)).toEqual({
      v: READY_CONTRACT_VERSION,
      routing: 'query',
      topLevel: true,
      urlWritable: true,
    })
  })

  // Stored as `widgetVersion`, which SahajCloud's schema types as a number.
  it('versions the contract with a number', () => {
    expect(typeof readinessMarker(observed).v).toBe('number')
  })

  it('reports what was measured rather than an idealised embed', () => {
    expect(readinessMarker({ routing: 'path', topLevel: false, urlWritable: false })).toMatchObject(
      { routing: 'path', topLevel: false, urlWritable: false },
    )
  })
})

describe('publishReadiness', () => {
  it('writes the marker as JSON under the attribute the verifier reads', () => {
    const attributes = stubDocument()

    publishReadiness(observed)

    expect(JSON.parse(attributes.get(READY_ATTR) ?? '')).toEqual(readinessMarker(observed))
  })

  it('takes the marker down again, so it cannot outlive the widget', () => {
    const attributes = stubDocument()

    publishReadiness(observed)
    clearReadiness()

    expect(attributes.has(READY_ATTR)).toBe(false)
  })

  // These run in a document we do not own, purely to be read by a verifier. A host that froze the
  // element gets an inconclusive verification, never a widget that fails to render.
  it('never throws when the host document refuses the write', () => {
    vi.stubGlobal('document', {
      documentElement: {
        setAttribute: () => {
          throw new Error('nope')
        },
        removeAttribute: () => {
          throw new Error('nope')
        },
      },
    })

    expect(() => publishReadiness(observed)).not.toThrow()
    expect(() => clearReadiness()).not.toThrow()
  })
})
