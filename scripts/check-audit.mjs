#!/usr/bin/env node

/**
 * Dependency-vulnerability gate.
 *
 *   node scripts/check-audit.mjs            # PR gate: fail on a NEW high/critical
 *   node scripts/check-audit.mjs --strict   # scheduled: also fail on a stale baseline
 *
 * ## The problem this solves
 *
 * Nothing in CI had ever run an audit, so the lockfile accumulated 64 advisories
 * — one critical, 24 high — with every gate green the whole way
 * (`.claude/reports/RELEASE_READINESS.md` §3.6). The requirement is not "have
 * zero advisories" (that is a dependency-update ticket, #101/#104); it is that
 * the NEXT one cannot arrive silently.
 *
 * ## Why a baseline instead of a plain `--audit-level high`
 *
 * A bare threshold has to be either red today — blocking every unrelated PR
 * until the backlog clears — or set so loose it would miss the thing it exists
 * to catch. Neither is a gate. So the known findings are pinned in
 * `audit-baseline.json`, each named with the ticket that owns it, and the gate
 * fires on anything NOT in that list. That makes the check green today and red
 * the day a new advisory lands, which is the actual goal.
 *
 * The escape hatch is deliberately small and reviewable: add the GHSA id to the
 * baseline with a one-line reason. It costs a commit, so it is a decision
 * someone made rather than a warning nobody read.
 *
 * ## Where the ratchet lives
 *
 * Baseline entries that no longer appear are only a warning here — a PR that
 * *fixes* an advisory must not be punished for it, and sibling dependency PRs
 * land concurrently. `--strict` (the weekly `audit.yml`) turns that into a
 * failure, so the list gets pruned somewhere it cannot block anyone's PR.
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Severities that fail the gate. Moderate/low are reported by the weekly run only. */
const GATED = ['critical', 'high']

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE_FILE = resolve(import.meta.dirname, 'audit-baseline.json')

const strict = process.argv.slice(2).includes('--strict')
const out = []

function say(...lines) {
  out.push(...lines)
}

function flush() {
  console.log(out.join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out.join('\n')}\n`)
  }
}

/** GitHub Actions annotation — visible on the run even when the log is folded. */
function annotate(level, message) {
  console.log(`::${level}::${message}`)
}

/**
 * Run the audit and parse it.
 *
 * `pnpm audit` exits non-zero whenever it finds anything, so a throw is the
 * normal path and the JSON we want is on the error's stdout. Returns null when
 * no JSON came back at all — a registry outage or a pnpm change, which is a
 * different failure from "found something" and is reported as such.
 */
function runAudit() {
  let stdout = ''

  try {
    stdout = execFileSync('pnpm', ['audit', '--prod', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    stdout = /** @type {{ stdout?: string }} */ (err)?.stdout || ''
  }

  try {
    const parsed = JSON.parse(stdout)

    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function main() {
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  const known = baseline.advisories || {}
  const audit = runAudit()

  say('### Dependency audit (`pnpm audit --prod`)', '')

  if (!audit) {
    const message =
      'Dependency audit produced no parseable output — the registry may be ' +
      'unreachable, or pnpm changed its JSON shape. No advisories were checked.'

    say(`⚠️ ${message}`)
    annotate('warning', message)
    flush()
    // Unavailable is not the same as clean. It never reds an unrelated PR, but
    // the weekly run treats it as a failure so a permanently broken check can't
    // masquerade as a passing one.
    process.exit(strict ? 1 : 0)
  }

  const counts = audit.metadata?.vulnerabilities || {}
  const found = Object.values(audit.advisories || {})
  const gated = found.filter((a) => GATED.includes(a.severity))

  const idOf = (a) => a.github_advisory_id || `npm-${a.id}`
  const fresh = gated.filter((a) => !(idOf(a) in known))
  const seen = new Set(gated.map(idOf))
  const stale = Object.keys(known).filter((id) => !seen.has(id))

  say(
    `${found.length} advisories in production dependencies — ` +
      `**${counts.critical || 0} critical, ${counts.high || 0} high**, ` +
      `${counts.moderate || 0} moderate, ${counts.low || 0} low.`,
    '',
    `${gated.length} at or above **high**, of which ` +
      `**${fresh.length} ${fresh.length === 1 ? 'is' : 'are'} new** ` +
      `(not in \`scripts/audit-baseline.json\`).`,
    '',
  )

  if (fresh.length) {
    say('| Severity | Package | Advisory | Fix |', '| --- | --- | --- | --- |')
    for (const a of fresh) {
      const fix = a.patched_versions && a.patched_versions !== '<0.0.0' ? a.patched_versions : '—'

      say(
        `| ${a.severity} | \`${a.module_name}\` | [${idOf(a)}](${a.url}) ${a.title} | \`${fix}\` |`,
      )
    }
    say('')
  }

  if (stale.length) {
    say(
      `${stale.length} baseline entr${stale.length === 1 ? 'y is' : 'ies are'} no longer ` +
        `reported and should be removed from \`scripts/audit-baseline.json\`: ` +
        `${stale.map((id) => `\`${id}\``).join(', ')}`,
      '',
    )
  }

  flush()

  if (fresh.length) {
    const message =
      `${fresh.length} new high/critical advisor${fresh.length === 1 ? 'y' : 'ies'}: ` +
      `${fresh.map((a) => `${idOf(a)} (${a.module_name})`).join(', ')}. ` +
      'Update the dependency, or — if it cannot be fixed now — add the id to ' +
      'scripts/audit-baseline.json with the ticket that owns it.'

    annotate('error', message)
    process.exit(1)
  }

  if (stale.length && strict) {
    annotate(
      'error',
      `Stale audit baseline: ${stale.join(', ')} no longer reported — prune from ` +
        'scripts/audit-baseline.json.',
    )
    process.exit(1)
  }

  if (stale.length) {
    annotate('notice', `Audit baseline has ${stale.length} stale entr(y/ies) — safe to prune.`)
  }

  annotate('notice', `Dependency audit: no new high/critical advisories (${gated.length} known).`)
}

main()
