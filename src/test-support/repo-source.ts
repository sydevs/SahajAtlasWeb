import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The repo root.
 *
 * ⚠ **Never resolve it with `new URL(<path>, import.meta.url)`** (#302). Vite rewrites that
 * expression under the WEB transform, which vitest picks for any `// @vitest-environment jsdom`
 * spec, so it yields `http://localhost:3000/src/test-support` and `fileURLToPath` throws AT
 * IMPORT — the whole file dies before one assertion runs. Measured, both ways, on this tree:
 * bare `import.meta.url` is left alone and stays a `file:` URL under both transforms, which is
 * why this form is safe where that one is not. `eslint.config.js` bans the other from the lane.
 */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * One repo file's raw text, by a path relative to the REPO root.
 *
 * `readSource` (`./source-tree`) is `src/`-relative, and would serve a path under `src/` too —
 * but that module walks `src/` at module scope, so importing it costs a recursive `readdirSync`
 * of the tree on every run (`docs/testing.md`). So a spec reading a file or two comes here,
 * whichever directory it sits in, and only a spec that inventories the tree pays for the walk.
 *
 * `eslint.config.js` enforces this for specs (#289).
 */
export const readRepoSource = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')
