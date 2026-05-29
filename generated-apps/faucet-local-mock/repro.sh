#!/bin/bash
set -e

echo "=== Running HardKAS Faucet Local Mock ==="

echo "1. Accounts List"
hardkas accounts list

echo "2. Plan a transaction from alice to bob"
hardkas tx plan --from alice --to bob --amount 100 --out plan.json

echo "3. Sign the transaction plan"
hardkas tx sign plan.json

echo "4. Send the transaction"
hardkas tx send plan.json

echo "5. Checking Doctor"
hardkas doctor

echo "=== Faucet Local Mock Completed ==="
