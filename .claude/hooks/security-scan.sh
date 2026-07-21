#!/bin/bash

# Security Scanning Hook (PreToolUse / Bash)
#
# Runs before Bash operations to prevent accidental exposure of secrets.
# Blocks git add/commit/push when a staged file contains a likely secret, and
# blocks a few outright-dangerous shell operations.
#
# Output contract: to BLOCK, we exit 2 AND write the human-readable reason to
# STDERR (that's what the agent harness surfaces on a non-zero hook exit). We
# also emit the structured `{"continue": false, "reason": …}` JSON on STDOUT for
# hosts that parse it. Writing the reason only to stdout (the old behaviour) left
# the harness reporting a bare "No stderr output" with no clue what tripped.

# Read hook input from stdin
input=$(cat)

# Extract command from JSON input
command=$(echo "$input" | grep -o '"command":"[^"]*"' | sed 's/"command":"//;s/"$//')

# High-confidence secret patterns — a match is almost certainly a real leak, so
# these are scanned in EVERY staged file, including public embed demos. The Atlas
# widget bundle is PUBLIC, so a leaked `sk.` Mapbox token or private key is a real
# exposure.
secret_patterns=(
  "sk\.eyJ"                                     # Mapbox SECRET access token (sk.…)
  "MAPBOX_SECRET[A-Z_]*\s*[:=]"                  # Mapbox secret assignment (not doc mentions)
  "CLOUDFLARE_API_TOKEN\s*[:=]"                  # deploy/runtime secret (Cloudflare Pages)
  "AWS_SECRET_ACCESS_KEY\s*[:=]"
  "SENTRY_AUTH_TOKEN\s*[:=]"
  "-----BEGIN PRIVATE KEY-----"
  "-----BEGIN RSA PRIVATE KEY-----"
)

# Generic credential heuristics — quoted key/secret/password/token assignments.
# These have a real false-positive rate, so they are skipped for known public
# embed files (see `public_embed_files`), where a PUBLISHED client key is expected
# by design. The high-confidence patterns above still apply to those files.
heuristic_patterns=(
  "api[_-]?key.*=.*['\"][a-zA-Z0-9_-]{20,}['\"]"
  "secret.*=.*['\"][a-zA-Z0-9_-]{20,}['\"]"
  "password.*=.*['\"][^'\"]{8,}['\"]"
  "token.*=.*['\"][a-zA-Z0-9_-]{20,}['\"]"
)

# Files that legitimately embed the PUBLIC `sahaj-atlas-client` api-key (the whole
# point of the embeddable widget is dropping a publishable key into host HTML).
# The generic heuristics are skipped for these; the secret_patterns above are not.
public_embed_files=(
  "demo.html"
)

is_public_embed() {
  local f="$1" pe
  for pe in "${public_embed_files[@]}"; do
    [ "$f" = "$pe" ] && return 0
  done
  return 1
}

# Block the tool call: reason on stderr (surfaced by the harness) + JSON on stdout.
block_secret() {
  local file="$1" pattern="$2" hit
  hit=$(grep -nE "$pattern" "$CLAUDE_PROJECT_DIR/$file" 2>/dev/null | head -1)
  {
    echo "security-scan: potential secret in '$file' (matched /$pattern/):"
    echo "    $hit"
    echo "  → If it's a real secret, move it to .env.local (gitignored) or use a VITE_-prefixed"
    echo "    public token. Secret tokens (sk.…) / private keys must never enter the public bundle."
    echo "  → False positive on a known-public value? Add the file to public_embed_files in"
    echo "    .claude/hooks/security-scan.sh."
  } >&2
  echo "{\"continue\": false, \"reason\": \"Security scan detected a potential secret in $file (pattern /$pattern/). Move real secrets to .env.local or use a VITE_-prefixed token; if it is a known-public value, allowlist the file in .claude/hooks/security-scan.sh.\"}"
  exit 2
}

# Check if command contains git add/commit/push
if echo "$command" | grep -qE "git\s+(commit|push|add)"; then
  # Get list of staged files
  staged_files=$(cd "$CLAUDE_PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)

  # Check each staged file for secrets
  while IFS= read -r file; do
    if [ -f "$CLAUDE_PROJECT_DIR/$file" ]; then
      for pattern in "${secret_patterns[@]}"; do
        if grep -qE "$pattern" "$CLAUDE_PROJECT_DIR/$file" 2>/dev/null; then
          block_secret "$file" "$pattern"
        fi
      done

      if ! is_public_embed "$file"; then
        for pattern in "${heuristic_patterns[@]}"; do
          if grep -qE "$pattern" "$CLAUDE_PROJECT_DIR/$file" 2>/dev/null; then
            block_secret "$file" "$pattern"
          fi
        done
      fi
    fi
  done <<< "$staged_files"
fi

# Check if command contains dangerous operations
dangerous_patterns=(
  "rm\s+-rf\s+/"
  "rm\s+-rf\s+\*"
  "chmod\s+-R\s+777"
  "curl.*\|\s*bash"
  "wget.*\|\s*sh"
)

for pattern in "${dangerous_patterns[@]}"; do
  if echo "$command" | grep -qE "$pattern"; then
    echo "security-scan: blocked potentially dangerous command (matched /$pattern/)." >&2
    echo "{\"continue\": false, \"reason\": \"Blocked potentially dangerous command: $pattern\"}"
    exit 2
  fi
done

# All checks passed
exit 0
