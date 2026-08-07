#!/bin/bash
#
# Pre-PR validation.
#
# Default (lean gate): lint + typecheck + unit tests. Fast feedback before a PR.
# --full: reproduce CI locally — + the production build and the size budget.
#
# CI (.github/workflows/ci.yml) is the source of truth:
# lint + typecheck + test:run + build + size.
#
# Usage:
#   .claude/skills/pr-prep/check.sh            # lint + typecheck + unit
#   .claude/skills/pr-prep/check.sh --full     # + pnpm build

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
MODE="${1:-}"

cd "$PROJECT_DIR" || exit 1

START_TIME=$(date +%s)

echo "=== Lint ==="
if ! pnpm lint; then
  echo
  echo "❌ Lint failed. Fix lint errors before continuing."
  exit 1
fi
echo "✓ Lint passed"
echo

echo "=== Typecheck ==="
if ! pnpm typecheck; then
  echo
  echo "❌ Typecheck failed. Fix type errors before continuing."
  exit 1
fi
echo "✓ Typecheck passed"
echo

echo "=== Unit tests ==="
if ! pnpm test:run; then
  echo
  echo "❌ Unit tests failed. Fix them before continuing."
  exit 1
fi
echo "✓ Unit tests passed"
echo

if [[ "$MODE" == "--full" ]]; then
  echo "=== Build (CI parity) ==="
  if ! pnpm build; then
    echo
    echo "❌ Build failed."
    exit 1
  fi
  echo "✓ Build passed"
  echo

  # Needs the build above, which is the whole reason it lives in --full: it is
  # the one CI step the lean gate structurally cannot reach.
  echo "=== Bundle-size budget ==="
  if ! pnpm size; then
    echo
    echo "❌ Eager payload is outside its budget. See scripts/check-bundle-size.mjs."
    exit 1
  fi
  echo "✓ Bundle size within budget"
  echo
else
  echo "ℹ Lean gate only (lint + typecheck + unit). Use --full to also run the"
  echo "  production build + size budget. CI runs lint + typecheck + test:run +"
  echo "  build + size on the PR."
  echo
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo "=== ✓ Checks passed — ${ELAPSED}s ==="
