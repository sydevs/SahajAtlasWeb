import vm from 'node:vm'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { readRepoSource } from '../src/test-support/repo-source'

import { auditBridge, runBridge } from './assert-classic-bridge.mjs'

/**
 * The bridge's own source, compiled the way its build entry is: no bundler, so no shared chunk
 * can appear here — that half belongs to the gate, which reads `dist/auto.js` after `pnpm build`.
 */
const BRIDGE = ts.transpileModule(readRepoSource('src/loader/bridge.ts'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText

/** A bridge that does everything right, so each defect below differs from it by one thing. */
const GOOD =
  '(()=>{let s=document.currentScript??document.querySelector(\'script[src*="auto.js"]\'),' +
  'l=document.createElement("script");l.type="module";' +
  'l.src=new URL("./loader.js"+new URL(s.src).search,s.src).href;' +
  'l.nonce=s.nonce;document.head.appendChild(l)})()'

const run = (page: Parameters<typeof runBridge>[2]) =>
  runBridge(new vm.Script(BRIDGE), vm.createContext({ URL }), page)

describe('src/loader/bridge.ts', () => {
  it('passes the gate', () => {
    expect(auditBridge(BRIDGE)).toEqual([])
  })

  it('reports a page with no auto.js tag instead of throwing', () => {
    const { appended, errors } = run({ asModule: true, tag: null })

    expect(appended).toEqual([])
    expect(errors).toEqual([
      '[sahaj-atlas] could not find the auto.js script tag, so nothing will load.',
    ])
  })

  it('reports a page that breaks it instead of throwing', () => {
    const hostile = {
      get src(): string {
        throw new Error('patched by the host')
      },
    }
    const { appended, errors } = run({ tag: hostile })

    expect(appended).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^\[sahaj-atlas\] could not start the loader.*patched by the host/)
  })
})

describe('auditBridge', () => {
  it('passes a bridge that does everything right', () => {
    expect(auditBridge(GOOD)).toEqual([])
  })

  // The defect a Wix client hit on 2026-11-15: auto.js WAS the loader, with a static import.
  it('rejects module syntax', () => {
    expect(auditBridge(`import{t as e}from"./assets/preload-helper-BLdHbfdN.js";${GOOD}`)).toEqual([
      expect.stringContaining('does not parse as a classic script'),
    ])
    expect(auditBridge(`${GOOD};export{}`)[0]).toContain('does not parse as a classic script')
    expect(auditBridge(`${GOOD};import.meta.url`)[0]).toContain('does not parse')
  })

  it('rejects a top-level lexical binding', () => {
    expect(auditBridge(`let e=1;${GOOD}`)).toEqual([
      expect.stringMatching(/threw when run as a module .*already been declared.*IIFE/),
    ])
  })

  it('rejects a global var, function or assignment', () => {
    for (const leak of ['var e=1;', 'function e(){}', 'globalThis.e=1;']) {
      expect(auditBridge(leak + GOOD)).toEqual([expect.stringContaining('leaves e on the host')])
    }
  })

  it("accepts the debug-ID globals @sentry/vite-plugin's snippet writes", () => {
    const snippet =
      ';{try{(function(){var e=globalThis;e._sentryDebugIds=e._sentryDebugIds||{};' +
      'e._sentryDebugIds[1]="id";e._sentryDebugIdIdentifier="sentry-dbid-id"})()}catch(e){}};'

    expect(auditBridge(snippet + GOOD)).toEqual([])
  })

  it('rejects a bridge that drops the query string, the nonce or the module type', () => {
    for (const broken of [
      GOOD.replace('+new URL(s.src).search', ''),
      GOOD.replace('l.nonce=s.nonce;', ''),
      GOOD.replace('l.type="module";', ''),
    ]) {
      expect(auditBridge(broken)).toEqual([
        expect.stringContaining('inserted the wrong loader as a classic script'),
        expect.stringContaining('inserted the wrong loader as a module'),
      ])
    }
  })

  it('rejects a bridge that only works as a classic script', () => {
    expect(auditBridge(GOOD.replace(/\?\?document\.querySelector\([^)]*\)/, ''))).toEqual([
      expect.stringContaining('threw when run as a module'),
    ])
  })
})
