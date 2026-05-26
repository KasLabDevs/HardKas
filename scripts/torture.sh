#!/usr/bin/env bash
# SAFETY_LEVEL: SIMULATION_ONLY
set -euo pipefail

SEED="${SEED:-$(date +%s)}"
ITERATIONS="${ITERATIONS:-300}"

echo "🔨 Building HardKAS monorepo..."
pnpm build

echo "🧪 Running unit & semantic test suites..."
pnpm test

echo "🔥 Launching HardKAS Deterministic Chaos Torture Suite..."
pnpm hardkas torture matrix \
  --iterations "$ITERATIONS" \
  --seed "$SEED" \
  --report ".hardkas/reports/torture-$SEED.json"

echo ""
echo "💡 To replay a specific failed case, run:"
echo "pnpm hardkas torture replay --seed $SEED --case <caseId>"
