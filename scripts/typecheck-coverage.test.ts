import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../src/test-support/repo-source'

// `pnpm typecheck` runs `tsc` over two configs, and a file neither one includes is never checked:
// nothing fails, nothing warns. `.ladle/` sat outside both for months, because TypeScript expands
// a bare directory in `include` with its own wildcard, which skips a directory whose name starts
// with a dot — so `"include": [".ladle"]` matched nothing, and four type errors hid there. This
// asks the compiler itself which files each config takes, the answer `tsc` acts on.

const CONFIGS = ['tsconfig.json', 'tsconfig.test.json']

const checked = new Set(
  CONFIGS.flatMap((file) => {
    const path = join(REPO_ROOT, file)
    const { config, error } = ts.readConfigFile(path, ts.sys.readFile)

    if (error)
      throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`)

    return ts.parseJsonConfigFileContent(config, ts.sys, REPO_ROOT, undefined, path).fileNames
  }),
)

const tracked = execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.mts', '*.cts'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)

describe('pnpm typecheck', () => {
  it('reads the tracked TypeScript it is meant to', () => {
    expect(tracked.length).toBeGreaterThan(100)
    expect(checked.size).toBeGreaterThan(100)
  })

  it('checks every tracked TypeScript file, in one config or the other', () => {
    expect(tracked.filter((file) => !checked.has(join(REPO_ROOT, file)))).toEqual([])
  })
})
