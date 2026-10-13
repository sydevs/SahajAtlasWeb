import ts from 'typescript'

import { readSource } from './source-tree'

/**
 * This is a separate module so that importing the walk never loads `typescript`. Seven of the
 * nine specs that inventory `src/` read raw text and have no parse to pay for.
 */
const PARSED = new Map<string, ts.SourceFile>()

/** One module's AST, parsed once per process. `path` is relative to `src/`. */
export const parseSource = (path: string): ts.SourceFile => {
  const cached = PARSED.get(path)

  if (cached) return cached

  const parsed = ts.createSourceFile(
    path,
    readSource(path),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  PARSED.set(path, parsed)

  return parsed
}
