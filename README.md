# HardKAS

> **Kaspa L1 Development Framework, Transaction Simulator & Visual IDE**

[![npm version](https://img.shields.io/badge/version-0.13.0--rc.1-blue.svg)](https://github.com/KasLabDevs/HardKas/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.5.0-emerald.svg)](package.json)
[![CI: Parity](https://img.shields.io/badge/CI-cross--platform%20truth-brightgreen.svg)](.github/workflows/ci.yml)
[![Release Status](https://img.shields.io/badge/status-hardened--alpha-amber.svg)](docs/status/claims.generated.md)

HardKAS is an open-source, local-first development framework, transaction simulator, and visual IDE for building and testing applications on **Kaspa L1**.

Inspired by the developer ergonomics of Ethereum tooling like **Hardhat** and **Foundry**, HardKAS provides:

- **Instant In-Memory Simulator:** Execute and test Kaspa transactions in sub-milliseconds without network latency.
- **Managed Docker Localnet:** One-command local `simnet` running official `rusty-kaspad` v2.0.0 with automatic CPU mining.
- **Deterministic Accounts & Funding:** Pre-configured developer accounts (`alice`, `bob`, `carol`) for reproducible test flows.
- **SilverScript & Covenants Toolchain:** Managed integration for the official `silverc v1.0.0` compiler, P2SH deploy/spend, and Toccata 1:1 auth-bound covenants.
- **Cryptographic Artifacts & Offline Replay:** Every transaction plan, signed payload, and receipt is hashed into immutable JSON artifacts that can be replayed and verified offline.
- **Visual Web Studio & IDE:** Interactive local console with React Flow DAG visualization, transaction inspector, and SSE telemetry.

> [!IMPORTANT]
> **Kaspa L1 is a UTXO BlockDAG, NOT an EVM.**
> HardKAS is built from first principles for Kaspa's UTXO and Kaspa Script architecture. It provides the developer experience of Hardhat for the Kaspa ecosystem without pretending Kaspa is an EVM or executing Solidity bytecode on L1.

---

## HardKAS vs. Ethereum Tooling (Hardhat & Foundry)

| Feature / Dimension | Ethereum (Hardhat / Foundry) | Kaspa L1 (HardKAS) |
|---|---|---|
| **Ledger Model** | Account-based global state | UTXO Proof-of-Work GHOSTDAG (BlockDAG) |
| **Smart Contracts** | EVM Bytecode (Solidity / Vyper) | Kaspa Script & SilverScript Covenants (Toccata) |
| **Fast Unit Testing** | Hardhat Network / Anvil (local EVM) | HardKAS Simulator (in-memory synchronous UTXO engine) |
| **Local Node Testing** | Local `geth` or `anvil` container | Managed Docker `rusty-kaspad` on `simnet` with CPU miner |
| **State Inspection** | Transaction traces & state diffs | Verifiable JSON Artifacts (`TxPlan`, `SignedTx`, `TxReceipt`) |
| **Verification & Debug** | Hardhat console / console.log | Deterministic Workflow Replay at specific DAA scores |
| **Dev Server & APIs** | Hardhat Node / Remix | HardKAS Dev Server (`@hardkas/dev-server` REST & SSE) |

---

## 60-Second Quickstart

### 1. Initialize a Workspace

```bash
# Initialize a new HardKAS workspace with deterministic accounts
npx @hardkas/cli init my-kaspa-app
cd my-kaspa-app
```

### 2. Fast In-Memory Simulation (No Node Required)

```bash
# Plan, verify, and simulate an in-memory transaction instantly
hardkas tx plan --from alice --to bob --amount 10 --network simulated --out tx-plan.json
hardkas artifact verify tx-plan.json --strict
hardkas tx sign tx-plan.json --account alice --out tx-signed.json
hardkas tx send tx-signed.json --network simulated --yes

# Verify deterministic simulator replay using the receipt ID printed by send
hardkas replay verify <receipt-id>
```

### 3. Managed Localnet (Real rusty-kaspad + Mining)

```bash
# Start a real local Kaspa simnet node in Docker with automated mining
hardkas localnet start --profile toccata-v2
hardkas localnet status --json
hardkas localnet fund alice --profile toccata-v2
```

### 4. Visual Studio / IDE

```bash
# Launch the interactive visual developer console (http://localhost:7420)
hardkas dev
```

---

## Why HardKAS

Normal apps:

```txt
request -> mutation -> hope
```

HardKAS:

```txt
intent -> artifact -> verification -> execution -> replay
```

The entire lifecycle of Kaspa UTXOs—from genesis injection to final signature submission—can be tracked, hashed, signed, processed in the simulator, receipted, indexed, and replayed.

## The Execution Contract

HardKAS `0.13.0-rc.1` introduces the strictly partitioned Execution Contract.
The Execution Contract is a tuple of `(mode, domain, network)` that unambiguously identifies the context in which an artifact was created, an execution target is connected, or an account exists.

- **`mode`**: The environment topology (`simulator`, `localnet`, `rpc`, `l2-rpc`)
- **`domain`**: The ledger semantics (`kaspa-l1`, `evm-l2`)
- **`network`**: The network identifier (`simulated`, `simnet`, `testnet-10`, `mainnet`)

Common targets:
- **Simulator**: `{ mode: "simulator", domain: "kaspa-l1", network: "simulated" }`
  The JS-based, in-memory, synchronous transaction simulator. Accounts, UTXOs, and funds are strictly synthetic.
- **Localnet**: `{ mode: "localnet", domain: "kaspa-l1", network: "simnet" }`
  A real Kaspa node (`rusty-kaspad`) running locally via Docker on `simnet` with real Proof-of-Work and local mining.
- **RPC**: `{ mode: "rpc", domain: "kaspa-l1", network: "testnet-11" }`
  A remote connection to a configured Kaspa node.

**Compatibility Invariants:**
- `artifact.execution` MUST be compatible with `target.execution`.
- `account.network/identity` MUST be compatible with `target.execution`.
- `receipt.execution` MUST be compatible with `artifact.execution` AND `target.execution`.

> [!WARNING]
> **Simulator != Kaspa simnet**
>
> `simulated` (network) = In-memory synthetic Kaspa ruleset in HardKAS `simulator` mode.
> `simnet` (network) = Official Kaspa network type used by HardKAS `localnet` mode.

## Local-First Status

HardKAS `0.13.0-rc.1` is local-first deterministic transaction infrastructure
for Kaspa/Toccata development.

Current certified baseline:

- `simulator` is the recommended default for fast, synchronous testing.
  - Toccata v2 Docker `localnet` baseline (`rusty-kaspad` on Kaspa `simnet`).
- Real local funding by mining with the upstream `kaspanet/cpuminer` image in `localnet`.
- Standard transaction lifecycle against the local node.
- SilverScript local OP_TRUE deploy/spend.
- Artifact-coherence simulation.
- Machine-verifiable golden corpus.
- Release gauntlet through `pnpm gauntlet:toccata`.
- mainnet is intentionally blocked outside the alpha happy path.
- HardKAS is not a wallet, custody system, consensus layer, or production mainnet
  signing environment.

### Toccata v2 Alpha Baseline

The `0.13.0-rc.1` release line includes a normalized Toccata v2 localnet flow:

- Docker `rusty-kaspad` v2.0.0 localnet funding with a compatible miner companion (`kaspanet/cpuminer`).
- Standard transaction lifecycle against the local node.
- Real Silver OP_TRUE deploy and spend receipts.
- Silver simulator artifact-coherence comparison.
- Machine-verifiable OP_TRUE and failure golden corpus in the Toccata gauntlet.

The default simulator comparison reports `SILVERSCRIPT_SIMULATION_MATCH` in
`artifact-coherence` mode while explicitly retaining
`PARTIAL_VM_SIMULATION`. Full Kaspa VM or consensus equivalence is not claimed.

Official release claims:

- `artifactCoherence`: `READY_MATCH`
- `runtimeOutcome`: `PARTIAL`
- `vmConsensusEquivalence`: `NOT_CLAIMED`
- `mainnet`: `BLOCKED_BY_POLICY`

### 0.13.0-rc.1 SDK Parity

`0.13.0-rc.1` is a SDK parity / developer experience patch. It adds high-level
SDK surfaces for capabilities, localnet status/start/fund, corpus verification,
and Silver planning/simulation/compare flows without changing the release
claims above. It enforces strict separation of execution environments across Artifact lineage.

SDK real Silver RPC/Docker execution remains explicitly unsupported in
`0.13.0-rc.1` via `SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED`; certified real
lifecycle execution remains CLI/localnet bounded.

### 0.13.0-rc.1 Programmability Builder Surface

`0.13.0-rc.1` also includes a local-only builder surface for SilverScript,
ZK corpus fixtures, and vProgs artifact inspection. This is a programmability
surface, not a protocol/runtime claim.

Programmability surfaces:

- `hardkas programmability capabilities --json`
- `hardkas programmability corpus verify fixtures/toccata-v2 --json`
- `hardkas programmability inspect <path> --kind silver|zk|vprog --json`
- `hardkas programmability app plan --kind full-lab --json`
- `await hardkas.programmability.capabilities()`
- `await hardkas.programmability.corpus.verify({ path })`
- `await hardkas.programmability.inspect({ kind, path })`

ZK corpus surfaces:

- `hardkas zk capabilities --json`
- `hardkas zk proof inspect <path> --json`
- `hardkas zk proof verify-local <path> --json`
- `hardkas zk corpus verify fixtures/toccata-v2/zk --json`
- `await hardkas.zk.capabilities()`
- `await hardkas.zk.proof.inspect(path)`
- `await hardkas.zk.proof.verifyLocal(path)`
- `await hardkas.zk.corpus.verify(path)`

vProgs inspect surfaces:

- `hardkas vprogs capabilities --json`
- `hardkas vprogs status --json`
- `hardkas vprogs inspect <artifact> --json`
- `await hardkas.vprogs.capabilities()`
- `await hardkas.vprogs.status()`
- `await hardkas.vprogs.inspect(path)`

SilverScript v1 (`hardkas silver`): the official silverc v1.0.0 and the Kaspa SDK,
with real-node evidence per capability in `fixtures/toccata-v2/silver` — P2SH
execution, relative timelock, and a Toccata tx-v1 1:1 auth-bound covenant
transition. General covenant support is not claimed.

ZK/vProgs lab claims:

- `ZK_CORPUS_SURFACE_READY`
- `VPROGS_INSPECT_SURFACE_READY`
- Groth16 corpus verification is local fixture coherence only.
- RISC0 is inspect-only unless a future helper is bundled.
- vProgs is inspect-only.
- `ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED`
- `VPROGS_STABLE_API_NOT_CLAIMED`
- `vmConsensusEquivalence`: `NOT_CLAIMED`
- `mainnet`: `BLOCKED_BY_POLICY`

## Release Gates

```bash
pnpm build
pnpm test
pnpm packaging:smoke
pnpm gauntlet:toccata
```

Toccata localnet and corpus commands:

```bash
hardkas localnet start --profile toccata-v2
hardkas localnet status --json
hardkas localnet fund alice --profile toccata-v2
hardkas corpus verify fixtures/toccata-v2/silver --json
```

## 30 Second SDK Example

```typescript
import { Hardkas } from "@hardkas/sdk";

const sdk = await Hardkas.create({
  execution: { mode: "simulator", domain: "kaspa-l1", network: "simulated" },
  autoBootstrap: true
});

const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
const signed = await sdk.tx.sign(plan, "alice");
const { receipt } = await sdk.tx.simulate(signed);

await sdk.replay.verify();

console.log(receipt.txId);
```

## CLI Reference

HardKAS CLI commands are scoped to execution worlds:

### Simulator
Synthetic testing without real nodes. Uses JS-based synthetic state and accounts.

HardKAS includes deterministic accounts (`alice`, `bob`, `carol`) by default, but you can create custom ones:

```bash
hardkas simulator account create custom-wallet
hardkas simulator fund custom-wallet --amount 1000
hardkas tx send --from custom-wallet --to bob --amount 10 --network simulated --yes
```

### Localnet (Managed Environment)
A complete managed developer environment wrapping a real `rusty-kaspad` node. It provides orchestration for local mining (PoW), real Kaspa simnet UTXOs, and developer-friendly local accounts.

```bash
hardkas localnet start --profile toccata-v2
hardkas localnet account create treasury
hardkas localnet fund treasury
```

### Node Primitive (Bare Node)
Low-level primitive for running the Kaspa node binary. It provides a bare `rusty-kaspad` with no funding orchestration, no account lifecycle, and no miner management.

```bash
hardkas localnet start
```

For the explicit artifact boundary:

```bash
hardkas tx plan --from alice --to bob --amount 10 --network simulated --out tx-plan.json
hardkas artifact inspect tx-plan.json
hardkas artifact verify tx-plan.json --strict
hardkas tx sign tx-plan.json --account alice --out tx-signed.json
hardkas tx send tx-signed.json --network simulated --yes
```

## Core Concepts

### Artifacts

Immutable JSON files representing planned transactions, signed payloads, receipts,
traces, workflows, and replay reports. They use canonical hashing so the same
inputs produce the same identity across platforms.

### Lineage

The causal chain between artifacts. A receipt points back to a signed transaction,
which points back to the original plan.

### Replay

The local verification engine that reconstructs a workflow from artifacts and
checks whether the observed state transition remains deterministic.

### Query Store

A rebuildable SQLite projection over `.hardkas/artifacts` and local events. It
exists for fast reads by CLI, query services and dev-server; the filesystem artifacts remain the
source of truth.

## Guarantees

- Deterministic hashing through canonical serialization.
- Tamper detection by recalculating artifact hashes at consumption time.
- Planning and signing isolation.
- Rebuildable projections from committed artifacts.
- Toccata v2 localnet baseline guarded by `pnpm gauntlet:toccata`.
- Mainnet broadcast blocked in this alpha release.

## What HardKAS Is Not

- Not a production wallet.
- Not a custody system.
- Not a consensus layer.
- Not a replacement for Kaspa nodes.
- Not a promise that local simulation equals mainnet finality.

See [docs/](docs/) for architecture, limits, command references, and security
claims.

