# Certification Capability Matrix
> **Claims are generated.** The authoritative values live in
> [claims.generated.md](./claims.generated.md), produced from `packages/sdk` by
> `pnpm docs:generate-claims`. Anything restated below is prose, not the source.

This matrix describes the capabilities HardKas should prove before a release is treated as stable. For 0.13.0-rc.2, the priority is the local-first development loop.

## Local Transaction Lifecycle

Status: primary release gate

Coverage:

- Initialize a workspace with simulated accounts.
- Plan a deterministic transaction.
- Sign the plan.
- Execute it through the simulated provider.
- Write plan, signed transaction, and receipt artifacts.
- Sync the query store and inspect the result.

## Artifact Security

Status: primary release gate

Coverage:

- Detect mutation of financial and network intent fields.
- Recalculate canonical hashes.
- Verify lineage from receipt back to signed transaction and plan.
- Quarantine or reject malformed artifacts.
- Replay local records without contacting a Kaspa node.

## Query Store Projection

Status: primary release gate

Coverage:

- Sync events and artifacts into SQLite.
- Rebuild the projection from workspace data.
- Detect drift between artifacts, events, and projection rows.
- Keep the artifact/event data as the source of truth.

## CLI Surface

Status: primary release gate for stable commands

Coverage:

- Stable commands show help and fail cleanly.
- Local transaction commands work end to end.
- `query store sync`, `verify`, and `artifact verify --strict` work on generated local data.
- Preview and research commands are clearly marked.

## SDK Surface

Status: primary release gate for the local API

Coverage:

- `Hardkas.create({ autoBootstrap: true, network: "simulated" })`.
- `sdk.tx.plan`.
- `sdk.tx.sign`.
- `sdk.tx.simulate`.
- Artifact reads, lineage trace, and query-store access.

## Dashboard And Client Boundary

Status: supporting release gate

Coverage:

- The dashboard reads the dev-server API instead of inventing state.
- `@hardkas/client` remains browser-safe and talks HTTP to the dev server.
- `@hardkas/react` provides React bindings over `@hardkas/client`.
- Both are workspace packages only: they are not published in this release
  ([Versioning: not published](./versioning.md#not-published)).
- The browser does not import the Node SDK directly.

## Real Simnet RPC

Status: advanced integration gate

Coverage:

- Explicit `--network simnet --provider rpc --url ...` planning.
- UTXO discovery from a real local node.
- Signing as a separate step.
- Explicit send through RPC.
- Receipt generation from node acceptance.

This is important, but it is not the default happy path.

## Toccata v2 Localnet Baseline

Status: certified alpha localnet gate

Coverage:

- Start Docker `rusty-kaspad` v2.1.0 in simnet, pinned by image digest (`KASPAD_REFERENCE_IMAGE`).
- Fund local accounts through a compatible miner companion.
- Run the standard transaction lifecycle against the local node.
- Compile SilverScript with the official silverc v1.0.0, deploy and spend P2SH contracts, and run 1:1 auth-bound
  covenant transitions (transaction v1), each with real-node evidence in `fixtures/toccata-v2/silver`.
- Run simulator deploy/spend receipts (the simulator is experimental and approximate: not consensus evidence).
- Compare simulator and Docker receipts in `artifact-coherence` mode.
- Verify the golden corpus (`hardkas corpus verify fixtures/toccata-v2/silver`).

Covenant topologies other than 1:1 (1:N, N:M, termination): built by the SDK's v1 engine and judged by a real
rusty-kaspad on simnet (`covenant-topologies-node.simnet`); not a corpus capability, not proven on testnet-10.

Claims:

- Artifact coherence: `READY_MATCH`.
- Runtime outcome: `PARTIAL`.
- VM/consensus equivalence: `NOT_CLAIMED`.
- Mainnet: `BLOCKED_BY_POLICY`.

The strict compare mode may still show non-consensus runtime identifier drift.
That drift is expected and does not block the alpha localnet gate.

## Mainnet

Status: out of scope for the 0.13.0-rc.2 happy path

Any future mainnet certification must be separate from local simulation and simnet tests. It needs stronger UX guards, signing policy, documentation, and operational review.
