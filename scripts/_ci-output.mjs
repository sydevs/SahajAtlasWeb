/**
 * Reporting helpers shared by the CI gate scripts (`check-audit.mjs`,
 * `check-bundle-size.mjs`).
 *
 * Both write the same two kinds of output, and the point of sharing them is that
 * both gates surface a failure the same way. The first draft copy-pasted this and
 * immediately drifted: the audit gate raised an annotation on failure while the
 * size gate only wrote to stderr, so one breach was visible on the run and the
 * other was only findable by unfolding the log.
 *
 * Underscore-prefixed so it reads as a helper rather than a runnable script, the
 * same convention `tests/smoke/_helpers/` uses.
 */

import { appendFileSync } from 'node:fs'

/**
 * Print a markdown report and, in Actions, add it to the job summary.
 * @param {string[]} lines
 */
export function report(lines) {
  const text = lines.join('\n')

  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
  }
}

/**
 * Emit a GitHub Actions annotation — surfaced on the run itself, so the reason a
 * gate failed doesn't depend on anyone expanding the log. Outside Actions it is
 * still a readable line, so local runs lose nothing.
 * @param {'error' | 'warning' | 'notice'} level
 * @param {string} message
 */
export function annotate(level, message) {
  // Annotations are single-line: a newline would truncate the message and leave
  // the rest as stray log output.
  console.log(`::${level}::${message.replace(/\s*\n\s*/g, ' ')}`)
}
