# Minimal Operations Runbook

This is the standard operational checklist for running a HardKAS deployment safely. It relies strictly on observed evidence rather than assumptions.

## 1. Verify the Workspace

Ensure you are in the correct HardKAS workspace and that the environment is sound.

```bash
hardkas env
hardkas doctor
```
*Expected Evidence:* `WORKSPACE_READY` and no fatal errors in the doctor report.

## 2. Verify the Node (RPC Health)

Before generating any transactions, prove that the target RPC node is alive, synced, and compatible.

```bash
hardkas rpc health
```
*Expected Evidence:* Node is reachable, `isSynced: true`, and the version supports the intended features (e.g., `>= 2.1.0` for Toccata).

## 3. Verify Account Authority

Ensure the account executing the transaction has sufficient spendable balance.

```bash
hardkas accounts balance deployer_account
```
*Expected Evidence:* Balance exceeds the required deployment amount + estimated fee + compute budget.

## 4. Execution & Artifact Generation

Construct the intent and verify the generated artifact. Do not blindly submit.

```bash
hardkas tx plan ... --out plan.json
hardkas artifact inspect plan.json
```
*Expected Evidence:* The JSON fields perfectly match your intended recipients, amounts, and `compute_budget`.

## 5. Submission & Receipt Verification

Submit the signed transaction and extract the receipt.

```bash
hardkas tx send signed_tx.json --out receipt.json
hardkas artifact explain receipt.json
```
*Expected Evidence:* The command returns a valid `txid`, and the explanation confirms the network accepted the payload.

## 6. Procedural Fallback (If Step 5 Fails)

If the transaction is rejected or times out:
1. **DO NOT run destructive commands** (`rm -rf`, `reset`).
2. Run `hardkas tx wait <txid>` to check if it's stuck in the mempool.
3. Check the failure taxonomy (`RPC_SCHEMA_ERROR`, `FEE_CONVERGENCE_ERROR`, etc.) and follow the [Troubleshooting Guide](./troubleshooting.md).
