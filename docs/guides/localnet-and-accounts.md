# HardKAS Localnet & Accounts Mental Model

Understanding the HardKAS developer environment requires a clear distinction between its two execution models. The CLI intentionally keeps these separated to provide both offline determinism and real-world network fidelity.

> [!CAUTION]
> **AGRESSIVE CLARIFICATION: `--network simulated` DOES NOT INTERACT WITH KASPA L1.**
> - ❌ No real Kaspa RPC.
> - ❌ No real UTXOs.
> - ❌ No mempool.
> - ❌ No network consensus.
> 
> Simulated mode is an **offline deterministic execution engine**, NOT a live blockchain. Do not confuse it with a "local chain".

## Quick Decision Matrix

Reduce cognitive load by choosing the right environment for your goal:

| I want to... | Use this network mode |
| :--- | :--- |
| **Run instant offline logic tests** | `simulated` |
| **Test real L1 UTXOs** | `simnet` |
| **Interact with RPC / Mempool / Mining** | `simnet` |
| **Use quick aliases like `sim_alice`** | `simulated` |
| **Test with real cryptographic wallets** | `simnet` / `devnet` / `testnet` |

---

## The Two Execution Models

HardKAS operates under two distinct environments:

### 1. Simulated Mode (`--network simulated`)
- **State:** Local deterministic JSON state.
- **Node:** No real `kaspad` node running.
- **UTXOs:** Fake/simulated UTXOs generated purely for state transition logic.
- **Workflow:** 100% offline-capable, artifact-first.

### 2. Simnet Mode (`--network simnet`)
- **State:** Real Docker container running the official Kaspa node (`kaspanet/rusty-kaspad`).
- **Node:** Real RPC, real mempool.
- **UTXOs:** Real cryptographic UTXOs mapped on the Kaspa DAG.
- **Workflow:** Requires actual L1 network validation.

---

## Simulated vs Simnet: The Cheatsheet

This distinction applies heavily to accounts and transactions. The most common pitfall is attempting to mix simulated accounts with the real simnet node.

| Feature / Mode | Simulated (`--network simulated`) | Simnet (`--network simnet`) |
| :--- | :--- | :--- |
| **Real `kaspad`** | ❌ Offline | ✅ Running in Docker |
| **Real UTXOs** | Simulated in memory | Real L1 DAG UTXOs |
| **RPC Services** | ❌ Not available / Mocked | ✅ Real (`127.0.0.1:18210`) |
| **Accounts** | `kaspa:sim_*` (Local dev aliases) | Real cryptographic Kaspa L1 addresses |
| **Network Valid?** | No (Fails Kaspa node checks) | Yes (Math-verified base32 addresses) |

---

## Local Dev Accounts vs Real Accounts

### 1. Local Dev Accounts (`kaspa:sim_alice`)
By default, commands like `hardkas accounts list` show accounts with names like `alice`, `bob`, `carol` and addresses like `kaspa:sim_alice`. 

> [!WARNING]
> `kaspa:sim_*` addresses are **NOT** valid Kaspa L1 addresses.
> They are placeholder development aliases designed strictly for the simulated mode. If you send these addresses to a real Kaspa node (Simnet/Testnet), the node will reject them instantly with a "request deserialization error".

### 2. Real L1 Accounts (`kaspasim:q...`)
To interact with the Docker Simnet, you must generate a real cryptographic address using the Kaspa WASM SDK.

```bash
# 1. Install the Kaspa SDK adapter (Required for L1 key generation)
pnpm add kaspa

# 2. Generate a real L1 account
hardkas accounts real generate
```

#### Why does the SDK dependency exist?
You might wonder: *"Why doesn't HardKAS just generate keys by itself?"*

This is a deliberate architectural choice, not a missing package bug. HardKAS is designed to abstract workflows, orchestration, and transaction lifecycle tooling. However, the core cryptographic primitives, key derivation, and Kaspa-specific serialization logic correctly live upstream in the official Kaspa WASM core (`kaspa` or `@kaspa/core-wasm`). 

By enforcing an external dependency for key generation, HardKAS ensures you are using the exact same battle-tested cryptographic math that the official node uses, minimizing consensus edge-cases.

---

## The Transaction Lifecycle (Plan → Sign → Send)

HardKAS enforces a strict 3-step offline transaction lifecycle:

1. **Plan:** Validates UTXOs and calculates fees.
2. **Sign:** Signs the deterministic plan with a private key.
3. **Send:** Broadcasts the signed transaction payload.

> [!TIP]
> **Plan validates UTXOs first.** If planning fails, signing and sending never happen.

### The "Insufficient Funds" Pitfall
If you attempt to run a transaction against the real `simnet` using a simulated account (e.g. `alice`), the `Plan` step will ask the real Kaspa node for UTXOs. Because `kaspa:sim_alice` is invalid, the node returns 0 UTXOs. 

The CLI will immediately abort the transaction, and you will see an **"Insufficient funds"** error before the transaction is ever signed or sent.

---

## Correct Usage Examples

### ✅ Example 1: Simulated Execution (Offline)
Testing deterministic business logic without Docker:

```bash
hardkas tx send \
  --from alice \
  --to bob \
  --amount 10 \
  --network simulated \
  --yes
```

### ✅ Example 2: Real Simnet Execution (Docker Node)
Testing real Kaspa network dynamics and RPC endpoints:

```bash
# 1. Generate real accounts
hardkas accounts real generate

# 2. Fund them (Ensure your node is mining or you have imported a funded key)
# Note: The local faucet currently requires a miner account to be configured.

# 3. Send transaction against the real node
hardkas tx send \
  --from kaspa:simnetaddress1xxxx... \
  --to kaspa:simnetaddress2yyyy... \
  --amount 10 \
  --network simnet \
  --yes
```
