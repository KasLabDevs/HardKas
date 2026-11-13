# HardKAS

> **Kaspa L1 Development Framework, Transaction Simulator & Developer Platform**

[![npm version](https://img.shields.io/badge/version-0.13.0--rc.2-blue.svg)](https://github.com/KasLabDevs/HardKas/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-24.22.1-emerald.svg)](docs/start/installation.md)
[![CI: Parity](https://img.shields.io/badge/CI-cross--platform%20truth-brightgreen.svg)](.github/workflows/ci.yml)
[![Release Status](https://img.shields.io/badge/status-hardened--alpha-amber.svg)](docs/status/claims.generated.md)

HardKAS is an open-source, local-first development framework, transaction simulator, and development environment for building and testing applications on **Kaspa L1**.

Inspired by the developer ergonomics of Ethereum tooling like **Hardhat** and **Foundry**, HardKAS provides:

- **Instant In-Memory Simulator (experimental):** Execute and test Kaspa transactions in sub-milliseconds without network latency. It is an approximate model: confirm timelock, covenant and mass behaviour on simnet ([limitations](docs/status/limitations.md#the-simulator-is-an-approximate-model)).
- **Managed Docker Localnet:** One-command local `simnet` running official `rusty-kaspad` v2.1.0 (pinned by image digest) with automatic CPU mining.
- **Deterministic Accounts & Funding:** Pre-configured developer accounts (`alice`, `bob`, `carol`) for reproducible test flows.
- **SilverScript & Covenants Toolchain:** Managed integration for the official `silverc v1.0.0` compiler, P2SH deploy/spend, and Toccata 1:1 auth-bound covenants.
- **Cryptographic Artifacts & Offline Replay:** Every transaction plan, signed payload, and receipt is hashed into immutable JSON artifacts that can be replayed and verified offline.
- **Visual IDE & Studio:** Standalone visual developer workbench with Monaco editor, SilverScript compiler, Deploy & Run, Covenant graph and local node telemetry ([HardKas IDE](https://github.com/KasLabDevs/HardKasIDE)).

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

Requirements: **Node.js 24.22.1** exactly (the version HardKAS is built, tested and pinned on: `engines` declares it, and `hardkas doctor` warns on another 24.x and fails on other major lines) and npm. Docker only for the local node.

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

To run a node of your own instead (your container, your ports) and take one payment, a SilverScript contract and a
covenant all the way to `artifact verify`, follow [Build on your own simnet](docs/start/build-on-simnet.md).

### 4. Local Dev Server & Visual IDE

```bash
# Launch the headless local developer API & telemetry daemon (http://localhost:7420)
hardkas dev

# For the complete visual studio & workbench (editor, compiler, covenant graph, node manager):
# Run HardKas IDE (https://github.com/KasLabDevs/HardKasIDE)
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

HardKAS `0.13.0-rc.2` uses the strictly partitioned Execution Contract.
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

HardKAS `0.13.0-rc.2` is local-first deterministic transaction infrastructure
for Kaspa/Toccata development.

Current certified baseline:

- `simulator` is the recommended default for fast, synchronous testing.
  - Toccata v2 Docker `localnet` baseline (`rusty-kaspad` on Kaspa `simnet`).
- Real local funding by mining with the upstream `kaspanet/cpuminer` image in `localnet`.
- Standard transaction lifecycle against the local node.
- SilverScript through the official silverc v1.0.0: P2SH deploy/spend and 1:1 auth-bound covenants on the local node.
- Artifact-coherence simulation.
- Machine-verifiable golden corpus.
- Release gauntlet through `pnpm gauntlet:toccata`.
- mainnet is intentionally blocked outside the alpha happy path.
- HardKAS is not a wallet, custody system, consensus layer, or production mainnet
  signing environment.

### Toccata v2 Alpha Baseline

The `0.13.0-rc.2` release line includes a normalized Toccata v2 localnet flow:

- Docker `rusty-kaspad` v2.1.0 localnet (pinned by digest) funding with a compatible miner companion (`kaspanet/cpuminer`).
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

### 0.13.0-rc.2 SDK Parity

`0.13.0-rc.2` includes high-level
SDK surfaces for capabilities, localnet status/start/fund, corpus verification,
and Silver planning/simulation/compare flows without changing the release
claims above. It enforces strict separation of execution environments across Artifact lineage.

SDK real Silver RPC/Docker execution remains explicitly unsupported in
`0.13.0-rc.2` via `SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED`; certified real
lifecycle execution remains CLI/localnet bounded.

### 0.13.0-rc.2 Programmability Builder Surface

`0.13.0-rc.2` also includes a local-only builder surface for SilverScript,
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

`pnpm test` is the canonical gate. CI runs it on Ubuntu, Windows and macOS from the frozen lockfile. For a release, run
it hermetically:

```bash
node scripts/gate-hermetic.mjs --home <a HARDKAS_HOME with kaspa-wasm installed>
```

That run gives the gate a private HARDKAS_HOME, makes Docker unreachable, refuses every non-loopback connection and,
by default, also refuses loopback connections to the canonical Kaspa wRPC ports 16210, 17210, 18210 and 18211. A
kaspad or simulator that happens to run on the machine therefore cannot change the verdict. `--deny-ports a,b` replaces
that list. `--allow-local-node-ports` turns it off for diagnosis only, and a run made that way is not the release gate.
Node-dependent suites run at their own levels (`vitest.simnet.config.ts`, `vitest.silverc.config.ts`), never inside
this gate.

## Stable and experimental features

Each CLI command states its maturity at the end of its `--help` description: `stable`, `preview`, `alpha`,
`experimental`, `research` or `internal`. Only `stable` commands are covered by the release scope. On the SDK, the
surfaces under `sdk.experimental.*` carry no stability promise. `hardkas capabilities --json` prints a warning that it
is internal/experimental. The levels, and what each one promises, are described in
[docs/status/versioning.md](docs/status/versioning.md), and the known gaps in
[docs/status/limitations.md](docs/status/limitations.md).

Not covered by any guarantee:

- `@hardkas/simulator` (experimental: an approximate model, not consensus evidence);
- the L2 extension (`@hardkas/ext-l2`) and the L2 library (`@hardkas/l2`), experimental and not published in this release;
- `@hardkas/pskt-native`, which is on hold and not published; `@hardkas/sdk` does not depend on it. Its prebuilt binary is built from rusty-kaspa **2.0.1** crates (not v2.1.0,
  which the rest of HardKAS pins). It ships for **win32-x64 only**, with no hash recorded in its provenance, and its
  `index.d.ts` is empty, so TypeScript consumers that import it do not compile. Its signer is permissive (audit
  HK-13). Rebuilding it is BLOCKED while the package is on hold. The SDK's PSKT surface uses the kaspa-wasm adapter
  unless the native one is registered explicitly. See
  [limitations](docs/status/limitations.md#hardkaspskt-native-is-on-hold).

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

// Replay is addressed by the receipt's artifact id (its contentHash), not by its txId.
const replay = await sdk.replay.verify(receipt.contentHash);

console.log(receipt.txId, replay.passed); // synthetic-<64 hex> true
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

