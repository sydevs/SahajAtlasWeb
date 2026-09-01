#!/usr/bin/env node

/**
 * Unit Test Hook (PostToolUse / Edit|Write)
 *
 * Runs the fast unit lane (`pnpm test:run`) after editing a source file or a
 * co-located spec, giving sub-second feedback while editing. Silent on success;
 * surfaces a short failure tail as NON-blocking context when a spec breaks (it
 * informs rather than aborting the edit). Tier 1 of the testing strategy — see
 * `docs/testing.md`.
 */

import { readFileSync } from 'fs'
import { spawnSync } from 'child_process'

let input
try {
  input = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  process.exit(0)
}

// Claude Code nests the path under tool_input.file_path; tolerate a top-level fallback.
const filePath = input?.tool_input?.file_path ?? input?.filePath ?? ''
const projectDir = process.env.CLAUDE_PROJECT_DIR || ''
const rel = filePath.startsWith(projectDir + '/') ? filePath.slice(projectDir.length + 1) : filePath

// Co-located specs live under src/ (`*.test.ts(x)` included). Skip Ladle stories
// (not covered by the unit lane) and anything outside src/.
if (!/^src\/.*\.(ts|tsx)$/.test(rel) || /\.stories\.(ts|tsx)$/.test(rel)) {
  process.exit(0)
}

const res = spawnSync('pnpm', ['test:run'], {
  cwd: projectDir || process.cwd(),
  encoding: 'utf-8',
  timeout: 60_000,
})

// status === 0 → green. status === null → timed out or couldn't spawn (not a
// test failure) — stay silent rather than crying wolf. Only a real non-zero
// exit means specs failed.
if (res.status === 0 || res.status === null) {
  process.exit(0)
}

const output = `${res.stdout || ''}${res.stderr || ''}`.split('\n').slice(-30).join('\n').trim()

// Non-blocking: report the failure as context so it's visible without aborting
// the edit. `continue: true` lets the session proceed.
console.log(
  JSON.stringify({
    continue: true,
    additionalContext: `Unit tests failed after editing ${rel}:\n\n${output}\n\nRun \`pnpm test:run\` to see the full output.`,
  }),
)
process.exit(0)
