# Causal Troubleshooting

When a HardKAS command fails, do not guess. Follow the causal chain to isolate the boundary.

## Symptom 1: Node Connection Refused

```bash
$ hardkas tx send tx.json
[ERROR] CONNECTION_REFUSED: Could not connect to 127.0.0.1:16110
```

**Likely Boundary:** RPC Node / Localnet
**Diagnostic Command:**
```bash
hardkas doctor
# OR
hardkas rpc health
```
**Evidence to Inspect:** Check if the Docker container is running (`docker ps`) or if the `kaspad` process is active. Check `.hardkas/localnet/` for crash logs.
**Safe Recovery:** 
```bash
hardkas node start --profile toccata-v2
```

## Symptom 2: Insufficient Funds / UTXO Selection Fails

```bash
$ hardkas tx plan ...
[ERROR] INSUFFICIENT_FUNDS: Required: 500000000, Available: 100000000
```

**Likely Boundary:** Planning / UTXO State
**Diagnostic Command:**
```bash
hardkas accounts balance alice
# AND
hardkas query utxos --address <alice_address>
```
**Evidence to Inspect:** Verify the account actually holds mature Kaspa. If the UTXOs are locked in pending transactions, they will not be selectable.
**Safe Recovery:** Fund the account, or wait for pending transactions to mine (`hardkas tx wait`).

## Symptom 3: Artifact Integrity Failure

```bash
$ hardkas artifact verify plan.json
[ERROR] INTEGRITY_FAILED: contentHash mismatch
```

**Likely Boundary:** Workspace / Artifact Storage
**Diagnostic Command:**
```bash
hardkas artifact inspect plan.json
```
**Evidence to Inspect:** Open `plan.json` in a text editor. Was it modified manually? Was a field deleted? 
**Safe Recovery:** If the artifact was never submitted to the network, delete it and regenerate it (e.g., re-run `hardkas tx plan`). If it was submitted, **do not delete it**; you must manually repair the JSON structure until the hash matches, or reconstruct it from the blockchain.

## Symptom 4: RPC Schema Rejection (v1 Transaction)

```bash
$ hardkas tx send tx.json
[ERROR] RPC_SCHEMA_ERROR: request deserialization error
```

**Likely Boundary:** Node Version Compatibility
**Diagnostic Command:**
```bash
hardkas rpc health --json
```
**Evidence to Inspect:** Look at the node version returned by the health check. If you are submitting a `v1` transaction (with `compute_budget`), but the node is running a pre-Toccata version (e.g., `v1.0.0`), it will reject the payload schema.
**Safe Recovery:** Upgrade the target node to `rusty-kaspa v2.1.0` or higher.

## Symptom 5: Replay Divergence

```bash
$ hardkas replay verify events.jsonl
[ERROR] REPLAY_DIVERGED: Replay verification failed
```

**Likely Boundary:** Determinism / Environment Mismatch
**Diagnostic Command:** Inspect the output of the replay runner. It will pinpoint the exact event index that diverged.
**Evidence to Inspect:** Did the network parameters change? Was a non-deterministic API used? Did the SilverScript compiler version change?
**Safe Recovery:** You cannot "fix" a diverged replay trivially. You must ensure the execution environment matches the original recorded parameters perfectly.
