
# Full Command Execution Rerun (HardKAS 0.8.1-alpha)

## Metrics
- Commands Classified: 124
- Commands Safely Executable: 98
- Commands Actually Executed: 98 (100% of safe)
- Commands Skipped: 26

## Execution Breakdown
- EXECUTED_SUCCESS: 41
- EXECUTED_EXPECTED_FAILURE: 54
- EXECUTED_REAL_FAILURE: 3

## Skipping Breakdown
- accounts real change-password: SKIPPED_NEEDS_NETWORK
- accounts real generate: SKIPPED_NEEDS_NETWORK
- accounts real import: SKIPPED_NEEDS_NETWORK
- accounts real init: SKIPPED_DESTRUCTIVE
- config repair: SKIPPED_DESTRUCTIVE
- console: SKIPPED_INTERACTIVE
- dag simulate-reorg: SKIPPED_NEEDS_NETWORK
- dag status: SKIPPED_NEEDS_NETWORK
- dev create: SKIPPED_INTERACTIVE
- kaspa doctor: SKIPPED_NEEDS_NETWORK
- local wizard: SKIPPED_INTERACTIVE
- localnet fork: SKIPPED_REQUIRES_DOCKER
- lock clear: SKIPPED_DESTRUCTIVE
- node logs: SKIPPED_REQUIRES_DOCKER
- node reset: SKIPPED_NEEDS_NETWORK
- node restart: SKIPPED_REQUIRES_DOCKER
- node start: SKIPPED_REQUIRES_DOCKER
- node status: SKIPPED_REQUIRES_DOCKER
- node stop: SKIPPED_REQUIRES_DOCKER
- query store migrate: SKIPPED_DESTRUCTIVE
- rpc dag: SKIPPED_NEEDS_NETWORK
- rpc doctor: SKIPPED_NEEDS_NETWORK
- rpc health: SKIPPED_NEEDS_NETWORK
- rpc info: SKIPPED_NEEDS_NETWORK
- rpc mempool: SKIPPED_NEEDS_NETWORK
- rpc utxos: SKIPPED_NEEDS_NETWORK

## Real Failures
- dev doctor
- sandbox
- torture matrix
  