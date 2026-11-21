---
title: Canonical AI Workflows
description: Verified step-by-step HardKAS CLI and SDK workflows for payments, SilverScript, Toccata covenants, artifact verification, and diagnostics.
---

# Canonical AI Workflows

All commands below are checked against the Commander CLI inventory (`apps/docs/docs-data/cli-command-inventory.json`) and repository simnet guides (`docs/start/build-on-simnet.md`, `docs/start/silverscript-covenants.md`, `docs/start/receipts-and-levels.md`).

> Replace `hardkas` with `npx hardkas` inside a project where `@hardkas/cli` is installed, or `pnpm hardkas` inside the HardKAS monorepo.

---

## 1. Send KAS on `simnet` and Confirm the Transaction

- **Goal:** Send a real KAS payment on `simnet` and confirm inclusion via an independent node query.
- **Supported environments:** `simnet` (verified), `simulated` (synthetic only), `testnet-10` (experimental opt-in). Mainnet is blocked.
- **Prerequisites:**
  - Running `rusty-kaspad` `v2.1.0` simnet node (e.g. `hardkas localnet start --profile toccata-v2` on `ws://127.0.0.1:18210`, or your own node configured in `hardkas.config.ts`).
  - Funded sender account on `simnet` with mature UTXOs (coinbase outputs require 1,000 DAA maturity on simnet) and `HARDKAS_PASSWORD` set in the environment.

### Option A: Fast 2-step send (when plan review is not needed)

- Omit `--url` if using the default HardKAS localnet (`ws://127.0.0.1:18210`). No `hardkas.config.mjs` is needed: `tx send --wait` submits and waits until `CONFIRMED` on the same `--url` node (default `--wait-timeout 60`; if confirmation times out, it exits `1` with `code: TX_SEND_WAIT_FAILED` and `outcome: submitted`).

```bash
export HARDKAS_PASSWORD='choose-a-simnet-password'
hardkas accounts real import --name payer --address <kaspasim:sender> --network simnet --private-key-env PK --password-env HARDKAS_PASSWORD
hardkas tx send --from payer --to <kaspasim:recipient> --amount 10 --network simnet --url ws://<host>:18210 --password-env HARDKAS_PASSWORD --yes --wait --json
```

### Option B: Audited 4-step lifecycle (`plan → verify → sign → send --wait`)

```bash
hardkas tx plan --network simnet --url ws://<host>:18210 --from miner --to alice --amount 100 --out plan.json
hardkas artifact verify plan.json
hardkas tx sign plan.json --account miner --password-env HARDKAS_PASSWORD --out signed.json
hardkas tx send signed.json --network simnet --url ws://<host>:18210 --yes --wait --json
# Or wait separately: hardkas tx wait <txId> --until confirmed --network simnet --url ws://<host>:18210 --json
```

- **Expected output:** `tx send` emits a `hardkas.txSubmission.v1` record under `.hardkas/artifacts/receipts/` and prints `txId`. `tx wait --until confirmed` polls until the accepting chain block reaches 100 blue-score confirmations (HardKAS default policy) and the node's UTXO view reflects the outputs.
- **Avoid:** Writing a custom `kaspa-wasm` script to build/sign/send standard payments.
- **Known limitations:** `replay verify` does **not** work on `simnet` (`REPLAY_MODE_UNSUPPORTED`); use `tx status` and `artifact verify` instead.

---

## 2. Compile and Execute SilverScript P2SH Workflows

- **Goal:** Compile a `.sil` contract with the pinned `silverc` compiler, verify reproducibility, deploy a P2SH output on `simnet`, and spend it.
- **Supported environments:** `simnet` (verified), `testnet-10` (experimental). Mainnet is refused (`SILVERSCRIPT_MAINNET_NOT_ENABLED`).
- **Prerequisites:**
  - `hardkas toolchain install silverc` (installs `silverc v1.0.0` with SHA-256 verification).
  - `hardkas silver doctor --network simnet` reports `silver.compile.v1` and `silver.p2sh.deploy-spend.v1` as `ready`.
  - Constructor bytes arguments must use `{ "kind": "bytes", "value": [/* 32-byte x-only pubkey bytes */] }` (raw hex strings are rejected with `SILVER_VALUE_INVALID`).

### Commands

```bash
# 1. Compile and verify deterministic reproduction
hardkas silver compile contracts/signed-release.sil --args contracts/owner.args.json --network simnet --out contracts/signed-release.compile.json
hardkas silver verify contracts/signed-release.compile.json --args contracts/owner.args.json

# 2. Deploy P2SH output on simnet (v0 by default; --wait confirms UTXO creation)
hardkas silver deploy contracts/signed-release.compile.json --from alice --amount 1 --network simnet --password-env HARDKAS_PASSWORD --wait

# 3. Spend entry using signature arg: [{"kind":"signature","account":"alice"}]
hardkas silver spend .hardkas/artifacts/silver/silverDeploy-<id>.json --entry release --to <alice-address> --args contracts/release.args.json --network simnet --password-env HARDKAS_PASSWORD --wait
```

- **Verification:** `silver verify` prints `REPRODUCED <hash> with silverc v1.0.0`. `silver deploy` and `silver spend` write `.hardkas/artifacts/silver/silverDeploy-*.json` and `silverSpend-*.json`; verify consensus depth with `hardkas artifact verify <record> --network simnet --require consensus`.
- **Important distinction (`silver test` vs node validation):**
  - `hardkas silver test` runs the local `cli-debugger` runner (`SCRIPT_VM`, labelled `UNVERIFIED`, requires `--allow-unverified-runner`). **It is NOT independent consensus proof.**
  - `hardkas silver test --on-node --network simnet` (experimental) executes reproducible cases as real node transactions and records node verdicts.

---

## 3. Perform Valid and Invalid Covenant Transitions Against a Real Node

- **Goal:** Create a Toccata 1:1 auth-bound covenant (`v1` transaction) on `simnet`, advance it with a valid state transition, and verify that an invalid transition is rejected by `rusty-kaspad` consensus.
- **Supported environments:** `simnet` (verified for 1:1 auth-bound transitions). 1:N / N:M / termination (`silver covenant start|advance`) are **experimental**.
- **Prerequisites:** Compiled `.sil` covenant artifact (e.g. `Counter` with `#[covenant(binding = auth, from = 1, to = 1, mode = transition)]`), funded account `alice`, running `rusty-kaspad 2.1.0` simnet node with miner active.

### Step A — Genesis & Valid Transition

```bash
# 1. Compile covenant with initial constructor args (e.g. [{"kind":"int","value":7}])
hardkas silver compile contracts/counter.sil --args contracts/counter.args.json --network simnet --out contracts/counter.compile.json

# 2. Genesis (v1 transaction; compute budget and fee default to the certified budget and the node's floor)
hardkas silver covenant genesis contracts/counter.compile.json --from alice --amount 10 --compute-budget 10 --fee 1000000 --network simnet --password-env HARDKAS_PASSWORD --wait

# 3. Valid transition (e.g. bump delta = 5 -> next state value = 12)
hardkas silver covenant transition .hardkas/artifacts/silver/silverCovenant-<genesisId>.json \
  --policy bump \
  --constructor-args contracts/counter.args.json \
  --state-map contracts/counter.state-map.json \
  --next-state contracts/counter.next-state.json \
  --args contracts/bump.args.json \
  --compute-budget 0 \
  --emit-args contracts/counter.next-args.json \
  --network simnet \
  --password-env HARDKAS_PASSWORD \
  --wait
```

### Step B — Invalid Transition (Negative Node Consensus Test)

`hardkas silver covenant transition` checks locally that the template did not change (`SILVER_SUCCESSOR_TEMPLATE_CHANGED`) and that the compiled successor state differs from the current state (`SILVER_SUCCESSOR_STATE_UNCHANGED` — so keeping `next-state` equal to the current state is rejected locally before broadcast). However, HardKAS **does not** evaluate SilverScript `require(...)` predicates or state arithmetic locally; `rusty-kaspad` enforces them at consensus.

To send an invalid transition that reaches the node and tests consensus rejection:
1. Keep `--next-state` **different** from the current state (so it passes `SILVER_SUCCESSOR_STATE_UNCHANGED`), while violating the contract rule — for example, pass `next-state` `{"value":{"kind":"int","value":99}}` with `delta = 5` (violates `prev_state.value + delta`), or `value: 13` with `delta = 0` (violates `require(delta > 0)`).
2. Run `hardkas silver covenant transition ... --wait --json`.
3. **Expected result:** HardKAS submits the `v1` transaction, the node rejects it at script verification, `silver covenant transition` exits non-zero, and the covenant tip on the node remains unchanged.

### Step C — Independent Verification

```bash
hardkas silver covenant inspect <covenantId> --network simnet
hardkas artifact verify .hardkas/artifacts/silver --recursive
```

- **Expected output:** `covenant <covenantId> VERIFIED`, showing `genesis` anchor verified and `tip` pointing to the unspent successor UTXO on the node.
- **Note on shells:** On PowerShell 5.1 / `cmd`, pass `--state-map` as a JSON file path (e.g. `contracts/counter.state-map.json` containing `{"value":0}`) to avoid quote-escaping issues.

---

## 4. Verify Transaction Receipts and Execution Artifacts

- **Goal:** Distinguish file integrity, node observation, and consensus confirmation for any transaction or SilverScript artifact.
- **Supported environments:** Offline integrity works everywhere (including `mainnet` artifacts); network/consensus checks require a node on the artifact's network (`simnet` or `testnet-10`).

### Commands

```bash
# 1. Inspect local artifact fields and lineage
hardkas artifact inspect <artifact-or-signed.json> --json

# 2. Offline integrity check (detects tampering via contentHash)
hardkas artifact verify <artifact-or-signed.json> --strict --json

# 3. Real-node consensus check (100 blue-score confirmations by default)
hardkas artifact verify <artifact-or-signed.json> --network simnet --require consensus --json

# 4. Query recorded submission receipt and live node status
hardkas tx receipt <txId> --json
hardkas tx status <txId> --network simnet --json
```

- **Replay asymmetry:** `hardkas replay verify <receipt-id>` works **only** for `simulated` ledger runs. Real-node sends write `hardkas.txSubmission.v1` and fail closed on `replay verify` with `REPLAY_MODE_UNSUPPORTED`.

---

## 5. Diagnose Node, RPC, Account, and UTXO Problems

- **Goal:** Isolate failures across workspace config, Docker container, RPC sync, keystore, or UTXO maturity without guessing.

### Commands

```bash
# 1. Overall workspace, toolchain, and node readiness
hardkas doctor --network simnet --json

# 2. Docker localnet status (managed container hardkas-kaspad-toccata-v2, wRPC 18210)
hardkas localnet status --json

# 3. Live node health, sync state, and virtual DAA score
hardkas rpc health --network simnet --json
hardkas rpc info --network simnet --json

# 4. Account balance and raw UTXOs visible to the node
hardkas accounts balance <account> --network simnet --json
hardkas rpc utxos <kaspasim-address> --network simnet --json
```

- **Key diagnostic rule:** `accounts balance` counts immature coinbase UTXOs, whereas `tx plan` skips them (`NO_SPENDABLE_UTXOS`). On `simnet`, wait ~1,000 DAA with the miner running before spending coinbase rewards.

---

## 6. Select the Appropriate HardKAS CLI or SDK Workflow

Use the **CLI** when orchestrating environments, keystores, or SilverScript tooling, and the **TypeScript SDK (`@hardkas/sdk`)** inside application code or Vitest suites.

| Task | Use CLI | Use SDK (`@hardkas/sdk`) | Notes |
| :--- | :--- | :--- | :--- |
| Start/stop/fund Docker localnet (`--profile toccata-v2`) | `hardkas localnet start` / `stop` / `fund` | **Not supported in 0.13.0-rc.3** | SDK explicitly throws directing you to the CLI. |
| Install `silverc` / `kaspa-wasm` | `hardkas toolchain install` | No | CLI-managed with SHA-256 verification. |
| Payments & batching in app logic | `hardkas tx plan` / `sign` / `send` / `wait` | `sdk.tx.plan`, `sign`, `send`, `waitForConfirmations` | Both use the `kaspa-wasm` Generator and emit artifacts. |
| Capability discovery before execution | `hardkas doctor --json`, `hardkas silver doctor --json` | `sdk.capabilities.get()` | Always check capabilities first. |
| SilverScript compile / P2SH / 1:1 covenant | `hardkas silver compile` / `deploy` / `spend` / `covenant` | `sdk.experimental.silver.*` | CLI is fastest for scripts & ops; SDK for custom tests. |
| Complex v1 covenants (1:N, N:M) | `hardkas silver covenant start` / `advance` (experimental) | `sdk.covenants.*` (experimental) | Requires explicit v1 compute budget & fee. |

---

## Related Repository Resources

- **Hands-on simnet walkthrough:** `docs/start/build-on-simnet.md`, `docs/start/quickstart-simnet.md`, `docs/start/silverscript-covenants.md`
- **Runnable TypeScript examples:** `examples/01-hello-kaspa` through `examples/11-kcc20-token` (`pnpm example:hello`, `pnpm example:transfer`, `pnpm example:localnet`, `pnpm example:covenant-demo`)
- **Builder Labs:** `labs/bl-001-offline-multisig`, `labs/bl-002-escrow-multisig`, `labs/bl-003-silverscript-covenant`, `labs/02-merchant-checkout` (in the repository's [labs](../../labs) folder)
- **Video tutorials:** [KasLabDevs YouTube](https://www.youtube.com/@kaslabdevs)
