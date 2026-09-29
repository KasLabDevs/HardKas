---
title: Limitations and Boundaries
description: What HardKAS deliberately does not do, and the known gaps in the current release.
---

# Limitations and Boundaries

These are product boundaries, not footnotes. HardKAS is built so that the things
it does not do are visible rather than implied, and so that a workflow fails
loudly at a boundary instead of quietly crossing it.

The machine-readable values behind everything on this page — what is `READY`,
what is `NOT_CLAIMED`, what is `BLOCKED_BY_POLICY` — are generated from the code
in [Release Claims](./claims.generated.md). Read this page for the reasoning;
read that one for the current values.

## What HardKAS is not

| HardKAS is not | Because |
| :------------- | :------ |
| **A wallet** | The keystore exists for local, automated, reproducible workflows. It does not manage seed phrases for end users and is not a place to import mainnet keys. |
| **A custody system** | There are no secure enclaves and no HSM integration. Nothing here is built to hold real capital. |
| **A consensus layer** | HardKAS reaches no distributed agreement. It works offline, trusting the deterministic hash of artifacts on your own disk. |
| **A replacement for a Kaspa node** | Network state comes from Kaspa RPC nodes. HardKAS does not index the global DAG. |
| **A smart-contract VM** | It orchestrates workflows and enforces determinism around external computation. It runs no Turing-complete state machine of its own. |

## What HardKAS is

- A **deterministic transaction workflow layer**: identical inputs on Windows, macOS, or Linux produce byte-identical transactions and hashes.
- An **artifact integrity system**: artifacts cannot be silently mutated, reordered, or replayed out of sequence without detection.
- A **CLI and SDK framework** for building verifiable pipelines.
- A **local-first verification environment** you can exercise fully before touching any real network.

## Product boundaries

### 1. Local-first only, for now

HardKAS is built around `network: "simulated"`. Toccata v2 simnet is the
certified local real-node baseline, including Docker funding, the standard
transaction lifecycle, and Silver `OP_TRUE` deploy and spend.

Testnet and mainnet are `BLOCKED_BY_POLICY`. Do not route high-value mainnet
transactions through HardKAS.

### 2. No built-in state machine VM

HardKAS proves artifact determinism and workflow integrity. It does not execute
a general smart-contract VM, so L2 and bridge logic depend on their own runtime.

The Silver/Toccata simulator is an **artifact-coherence** simulator. It may
report `SILVERSCRIPT_SIMULATION_MATCH` for verified local fixtures, but partial
VM simulation remains explicit. Full Kaspa VM or consensus equivalence is not
claimed.

### 3. The query store is a projection, not the truth

The SQLite query store can lag, be rebuilt, or be corrupted independently of the
artifacts it describes. The filesystem artifacts remain the source of truth. If
the projection drifts:

```bash
hardkas query store sync
hardkas query store doctor
hardkas query store rebuild
```

### 4. Legacy artifacts may be rejected rather than upgraded

Strict readers can refuse older artifacts instead of silently migrating them.
Treat that as a safety barrier: migration should be explicit and auditable, not
implicit.

### 5. The dashboard is mostly observational

The dev-server exposes transaction endpoints, but the dashboard is primarily an
observability surface. The canonical local workflow is CLI-first or SDK-first.

### 6. The ZK corpus surface is local-only

Groth16 corpus verification checks manifests, content hashes, public inputs,
verification-key metadata, and local fixture coherence. It claims nothing about
production trusted-setup hygiene, proof generation correctness, on-chain
verification, bridge security, or trustless exits.

RISC0 is inspect-only. Local receipt verification returns
`RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED` or `RISC0_VERIFIER_UNAVAILABLE` until
a pinned helper is bundled and tested.

### 7. vProgs is inspect-only

The vProgs surface inspects local artifacts and reports capabilities and status.
It claims no vProgs runtime, no API stability, no on-chain ZK verification, no
bridge support, no trustless exit, and no testnet or mainnet readiness.

## Known gaps in this release

### SilverScript tooling is simulation-only

You can build templates, compile scripts, and simulate execution. You cannot
broadcast custom scripts to mainnet through the toolkit.

### No L2 production tooling

HardKAS provides local-first testing ground for L2 paradigms such as state
channels and off-chain state commitments. There is no "deploy to production"
tooling for L2 sequencers or indexers.

### No mainnet propagation guarantees

A transaction that passes local simulation has been checked for structural and
lineage coherence against HardKAS's own rules. That is **not** a consensus
validity check — `vmConsensusEquivalence` is `NOT_CLAIMED`, and real nodes may
reject a locally valid transaction under their own mempool policies. Test
against Docker `simnet` before drawing conclusions about real-network behaviour.

### Snapshots do not capture remote node state

Snapshot tooling branches, tests, and merges **local** state. Against a real
remote backend such as the RPC plugin, snapshots capture metadata and stubs
only; they do not snapshot the remote node's DAG. Time-travel debugging stops at
the local simulation boundary.

### The RPC backend plugin is a V1

`@hardkas/plugin-rpc-backend` routes `balance()`, `history()`, and `utxos()`
reliably, but has no resilient connection pooling and no retry jitter. If the
node disconnects, restart the script.

### Node on Windows: the SDK uses the `ws` WebSocket

HardKAS talks to the node through the official kaspa-wasm `RpcClient`. That
client opens its connection through the global W3C `WebSocket`. With Node's
built-in `WebSocket` on Windows, a process that opens and closes four or more
connections and then calls `process.exit` aborts
(`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`). We reproduced this
with the bare SDK, without HardKAS code. So `@hardkas/kaspa-rpc` sets the global
to the `ws` package's `WebSocket`, as kaspa-wasm's Node instructions do, unless
something else replaced the global after HardKAS loaded. This is a compatibility
shim, not a HardKAS transport: the SDK still drives the connection. It comes out
once the upstream combination is fixed (see
`packages/kaspa-rpc/src/upstream/node-websocket-compat.ts`).

## Related

- [Release Claims](./claims.generated.md) — the generated, authoritative values.
- [Capability Matrix](./capability-matrix.md) — what a release must prove.
- [Security Claims](./security-claims.md) — what artifact validation does and does not protect against.
- [Versioning](./versioning.md) — which surfaces are stable, preview, or experimental.
