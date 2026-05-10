#!/usr/bin/env bash
set -Eeuo pipefail

# HardKAS full local verification runner
#
# Usage:
#   chmod +x scripts/check-all.sh
#   ./scripts/check-all.sh
#
# Optional:
#   SKIP_INSTALL=1 ./scripts/check-all.sh
#   SKIP_LINT=1 ./scripts/check-all.sh
#   SKIP_EXAMPLES=1 ./scripts/check-all.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
FAILED_STEPS=()

log() {
  printf "\n\033[1;36m==> %s\033[0m\n" "$1"
}

ok() {
  PASS=$((PASS + 1))
  printf "\033[1;32m✓ %s\033[0m\n" "$1"
}

bad() {
  FAIL=$((FAIL + 1))
  FAILED_STEPS+=("$1")
  printf "\033[1;31m✗ %s\033[0m\n" "$1"
}

run_step() {
  local name="$1"
  shift

  log "$name"

  if "$@"; then
    ok "$name"
  else
    bad "$name"
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1
}

log "HardKAS verification runner"

if ! require_cmd node; then
  echo "Missing node"
  exit 1
fi

if ! require_cmd pnpm; then
  echo "Missing pnpm"
  echo "Install:"
  echo "  corepack enable"
  echo "  corepack prepare pnpm@9.15.4 --activate"
  exit 1
fi

echo "Node: $(node -v)"
echo "pnpm: $(pnpm -v)"

if [[ "${SKIP_INSTALL:-0}" != "1" ]]; then
  run_step "Install dependencies" pnpm install --frozen-lockfile
else
  echo "Skipping install because SKIP_INSTALL=1"
fi

run_step "Workspace package graph" pnpm -r list --depth -1

run_step "TypeScript typecheck" pnpm typecheck

run_step "Build all packages" pnpm build

if [[ "${SKIP_LINT:-0}" != "1" ]]; then
  run_step "Lint" pnpm lint
else
  echo "Skipping lint because SKIP_LINT=1"
fi

run_step "Unit tests" pnpm test

#
# CLI smoke tests
#

log "CLI smoke tests"

run_step \
  "CLI help" \
  pnpm --filter @hardkas/cli run dev -- --help

run_step \
  "CLI bridge status" \
  pnpm --filter @hardkas/cli run dev -- l2 bridge status --network igra

run_step \
  "CLI bridge assumptions" \
  pnpm --filter @hardkas/cli run dev -- l2 bridge assumptions --network igra

#
# Examples
#

if [[ "${SKIP_EXAMPLES:-0}" != "1" ]]; then

  log "Examples"

  run_step \
    "Example 01 - hello kaspa" \
    pnpm example:hello

  run_step \
    "Example 02 - basic transfer" \
    pnpm example:transfer

  run_step \
    "Example 03 - localnet demo" \
    pnpm example:localnet

  run_step \
    "Example 04 - trace and replay" \
    pnpm example:trace

  run_step \
    "Example 05 - snapshot restore" \
    pnpm example:snapshot

  run_step \
    "Example 06 - rpc node health" \
    pnpm example:rpc-health

  run_step \
    "Example 07 - failure debugging" \
    pnpm example:failure

  run_step \
    "Example 08 - igra l2 readonly" \
    pnpm example:igra-readonly

  run_step \
    "Example 09 - bridge assumptions" \
    pnpm example:bridge-assumptions

  run_step \
    "Example 10 - CI workflow" \
    pnpm example:ci

else
  echo "Skipping examples because SKIP_EXAMPLES=1"
fi

#
# Safety / architecture guardrails
#

log "Architecture guardrails"

if grep -R \
  "Kaspa L1.*EVM\|L1.*executes.*EVM\|trustless.*pre-zk\|trustless.*mpc" \
  README.md docs packages examples \
  2>/dev/null; then

  bad "Architecture wording guardrail"

else
  ok "Architecture wording guardrail"
fi

#
# Secret scan
#

log "Secret scan"

if grep -R \
  "privateKey\|mnemonic\|seed phrase" \
  packages examples \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  2>/dev/null \
  | grep -v "placeholder" \
  | grep -v "example" \
  | grep -v "never printed" \
  | grep -v "plaintext"; then

  bad "Secret scan"

else
  ok "Secret scan"
fi

#
# Final summary
#

log "Result"

echo "Passed: $PASS"
echo "Failed: $FAIL"

if [[ "$FAIL" -ne 0 ]]; then
  echo
  echo "Failed steps:"

  for step in "${FAILED_STEPS[@]}"; do
    echo " - $step"
  done

  exit 1
fi

echo
echo "All checks passed."
