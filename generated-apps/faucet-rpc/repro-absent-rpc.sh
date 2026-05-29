#!/bin/bash
set +e

echo "=== Mode 2: Absent RPC Test ==="
echo "Testing RPC Health..."
hardkas rpc health

echo "Testing accounts balance (RPC should fail)..."
hardkas accounts balance alice

echo "Testing tx plan (RPC should fail)..."
hardkas tx plan --from alice --to bob --amount 10 --out plan-rpc.json

echo "=== End Absent RPC Test ==="
