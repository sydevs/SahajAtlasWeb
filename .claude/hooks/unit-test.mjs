#!/usr/bin/env node

/**
 * Unit Test Hook (PostToolUse / Edit|Write)
 *
 * Runs the specs one edit can break after editing a source file or a co-located spec.
 * Silent on success; surfaces a short failure tail as NON-blocking context when a spec
 * breaks (it informs rather than aborting the edit). Tier 1 of the testing strategy — see
 * `docs/testing.md`, which states the budget this has to run inside and what the selection
 * deliberately does not reach. The whole lane still runs in the lean gate and in CI.
 */

import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'

import { selectSpecs } from '../../scripts/select-unit-specs.mjs'

let input
try {
  input = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  process.exit(0)
}

// Claude Code nests the path under tool_input.file_path; tolerate a top-level fallback.
const filePath = input?.tool_input?.file_path ?? input?.filePath ?? ''
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const rel = filePath.startsWith(projectDir + '/') ? filePath.slice(projectDir.length + 1) : filePath

// Empty for a Ladle story, a path outside src/, or a tree with no specs in it.
const specs = selectSpecs(rel, projectDir)
if (specs.length === 0) {
  process.exit(0)
}

const res = spawnSync('pnpm', ['test:run', ...specs], {
  cwd: projectDir,
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
