# The HardKAS Mental Model

Before writing code, understand the core product boundary: HardKAS is a
local-first deterministic workspace for Kaspa builders.

## 1. Local-First Over Testnet

Traditional crypto development often starts with remote testnets. That adds
latency, RPC failures, faucet dependency, and network state you do not control.

HardKAS starts with a simulated offline network in `.hardkas/localnet.json`. You
prove your transaction logic locally first, then move outward to `simnet`,
testnet, and eventually carefully controlled production tooling.

## 2. Deterministic Artifacts

In HardKAS, every meaningful state transition becomes an artifact: plan, signed
transaction, receipt, trace, replay report, or workflow.

Each artifact has a `contentHash` derived from canonical serialization. The same
inputs should produce the same identity on Windows, Linux, and macOS.

## 3. The Workspace Is The Ledger

The `.hardkas/` directory is the local source of truth. It contains artifacts,
local simulated state, events, and rebuildable projections.

SQLite query-store data and dashboard views are projections. They are useful,
but they are not the authority.

## 4. Zero-Trust Artifact Loading

HardKAS does not trust an artifact just because it exists on disk. When an
artifact is consumed, the SDK recalculates the canonical hash and rejects
tampering.

That is the main safety idea: planning, signing, execution, replay, and
observability all meet at the artifact boundary.
