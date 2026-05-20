#!/usr/bin/env bash

set -e

# HardKAS TX Lifecycle Smoke Test (Bash)

CLI_SRC="$(pwd)/packages/cli/src/index.ts"
TSX="$(pwd)/node_modules/.bin/tsx"

hardkas() {
    "$TSX" "$CLI_SRC" "$@"
}

echo "=== HardKAS TX Lifecycle Smoke Test ==="

# 0. Version
hardkas --version

# 1. Clean project
PROJECT="tx-lifecycle-smoke"
WORKSPACE="$(pwd)"
PROJECT_DIR="$WORKSPACE/$PROJECT"

if [ -d "$PROJECT_DIR" ]; then
    rm -rf "$PROJECT_DIR"
fi

hardkas new "$PROJECT"
cd "$PROJECT_DIR"

# Commenting out pnpm install as we use the local monorepo source via tsx
# pnpm install

# 2. Environment
hardkas doctor
hardkas capabilities --json

# 3. Node
hardkas node start
hardkas node status
hardkas rpc health --wait

# 4. Accounts
hardkas accounts list
hardkas accounts fund alice --amount 1000
hardkas accounts fund bob --amount 100

# 5. Plan
hardkas tx plan \
  --from alice \
  --to bob \
  --amount 10 \
  --network simnet \
  --out tx-plan.json

if [ ! -f "tx-plan.json" ]; then
    echo "tx-plan.json was not created"
    exit 1
fi

# 6. Verify plan
hardkas artifact verify tx-plan.json

# 7. Sign
hardkas tx sign tx-plan.json \
  --out tx-signed.json

if [ ! -f "tx-signed.json" ]; then
    echo "tx-signed.json was not created"
    exit 1
fi

# 8. Verify signed artifact
hardkas artifact verify tx-signed.json

# 9. Send
SEND_OUTPUT=$(hardkas tx send tx-signed.json \
  --track lifecycle-demo \
  --network simnet \
  --json)

echo "$SEND_OUTPUT"

TXID=$(echo "$SEND_OUTPUT" | grep -o '"txId": "[^"]*' | cut -d'"' -f4 | head -n1)

if [ -z "$TXID" ]; then
    echo "txId missing from tx send output"
    exit 1
fi

echo "TXID: $TXID"

# 10. Deployment tracking
hardkas deploy list
hardkas deploy inspect lifecycle-demo --network simnet

# 11. Receipt + Trace
hardkas tx receipt "$TXID" --json > tx-receipt.json
hardkas tx receipt "$TXID"
# hardkas tx trace $txid  # Trace disabled while query API stabilizes

# 12. Query store
hardkas query store sync
hardkas query artifacts list

# 13. Lineage
hardkas artifact lineage tx-signed.json

# 14. Replay
hardkas replay verify

# 15. Final doctor
hardkas doctor --json

echo ""
echo "=== TX Lifecycle Smoke Test PASSED ==="
