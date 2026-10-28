import ts from 'typescript'

import { memo, readSource } from './source-tree'

// A module of its own so that importing the walk never loads `typescript`: eight of the eleven
// specs that inventory `src/` read raw text and have no parse to pay for.

/** One module's AST. `path` is relative to `src/`. */
export const parseSource = memo((path) =>
  ts.createSourceFile(
    path,
    readSource(path),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  ),
)
