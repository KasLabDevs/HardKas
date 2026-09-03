# HardKAS 0.12.0-rc.18 Release Validation Report

## Executive Summary
This report summarizes the validation of the HardKAS `0.12.0-rc.18` framework against the core Builder Labs requirements. It focuses specifically on the local execution flows, transaction lifecycle, and strict isolation between simulated, localnet, and rpc execution environments.

## Validated Scenarios

### 1. `localnet` Miner & Node Support
- Verified `hardkas localnet start --profile toccata-v2` cleanly spawns a local Kaspa `simnet` network using Docker.
- Verified the local node can be queried using `ws://127.0.0.1:18210`.
- **Status: PASS**

### 2. Execution World Isolation
- Identified and resolved CLI issues where the `simulated` environment was conflated with the `simnet` network target. 
- Ensured strict parsing via `HardkasExecutionTarget` that separates:
  - `mode: "simulator"` (pure JavaScript in-memory execution)
  - `mode: "localnet"` (Docker-driven Kaspa nodes)
  - `mode: "rpc"` (External live networks)
- The CLI output now accurately reports "Execution Scope: network broadcast" vs "Execution Scope: local deterministic replay".
- **Status: PASS**

### 3. Transaction Lifecycle (E2E)
An automated `test-localnet-flow.ts` was implemented to trace the lifecycle from account creation to finalized broadcast.

1. **Account Creation**: Generated accounts using the `localnet-plaintext` security model.
2. **Funding**: Executed `localnet fund` which successfully orchestrated the local miner to construct blocks to fund the test accounts.
3. **Planning**: Triggered `tx plan`, which securely selected the mined UTXOs via the local node RPC endpoints and persisted a valid `TxPlanArtifact` with `execution.mode = "localnet"`.
4. **Signing**: Generated a `SignedTxArtifact` containing valid signatures against the plan.
5. **Broadcasting**: Executed `tx send` against the localnet node.
   - *Issue Addressed*: Handled the DAG syncing race condition by implementing a small wait time, resolving the node's `is an orphan where orphan is disallowed` rejection. *(Note for 0.12.0-rc.18 Stable: This `sleep` is a temporary workaround and will be replaced with a deterministic state-based wait until UTXOs are confirmed spendable).*
   - *Issue Addressed*: Corrected the CLI formatting to properly announce "Transaction broadcast successfully" instead of incorrectly reporting a simulation.
6. **Receipt Verification**: Confirmed the SDK writes the final `TxReceiptArtifact` to the `artifacts/receipts` directory with `status = "submitted"` and proper lineage tracing back to the plan. *(Note for 0.12.0-rc.18 Stable: Localnet currently guarantees "submitted" status. The receipt state machine will be hardened in the stable release to differentiate and poll for "accepted" and "confirmed" statuses).*
- **Status: PASS**

## Evidence

```yaml
Node:
  version: rusty-kaspad v2.0.0 (simnet)

Execution:
  mode: localnet
  network: simnet

Artifacts:
  TxPlan: Validated
  SignedTx: Validated 
  TxReceipt: Validated

Transaction:
  txid: 08f84fbd5c2742818672977da9cc7aaf7b187194fd72292dd05d639df8dca9f1

Receipt:
  status: submitted

Replay:
  status: PASS

Execution Guard:
  status: PASS
```

## Next Steps for 0.12.0-rc.18 (Stable)
- Replace `sleep()` with state-based waits for UTXO maturity.
- Harden the receipt state machine (planned -> signed -> submitted -> accepted -> confirmed).
- Expand documentation with the definitive diagram of the three Execution Worlds.
- Finalize the minor artifact schema validations in `core/src/schema` for `TxPlan`.
