# Version Guarantees

HardKAS is currently in the `0.9.6-alpha` release cycle.

The project is stable enough for local development workflows, but it is still an
alpha. APIs, command names, and advanced integrations may change while the
local-first product surface is tightened.

## Stable In This Alpha

These boundaries should change only with intentional release notes:

- **Artifact identity:** content-addressed transaction plans, signed payloads,
  receipts, traces, and workflow artifacts.
- **Hashing rules:** canonical serialization and deterministic sorting used to
  calculate `contentHash`.
- **Local simulated state:** `.hardkas/localnet.json` as the local UTXO state
  boundary.
- **Core transaction lifecycle:** `plan -> inspect/verify -> sign -> send/simulate
-> receipt -> replay`.
- **Toccata v2 localnet baseline:** Docker simnet funding, standard transaction
  lifecycle, Silver OP_TRUE deploy/spend, and corpus verification through
  `pnpm gauntlet:toccata`.
- **Release claims:** `artifactCoherence = READY_MATCH`,
  `runtimeOutcome = PARTIAL`, `vmConsensusEquivalence = NOT_CLAIMED`, and
  `mainnet = BLOCKED_BY_POLICY`.

## Preview

These systems exist and are useful, but are still being hardened:

- Query-store projections and dashboard views.
- Dev-server HTTP workflow endpoints.
- Real `simnet`/testnet RPC adapters.
- Localnet snapshots and fork/replay tooling.
- Workflow and session orchestration.

## Experimental

These surfaces may change quickly:

- Mainnet-related signing flags and RPC paths. Mainnet is blocked by policy for
  the 0.9.6-alpha release claim.
- L2, bridge, MetaMask, KasWare, and sandbox integrations.
- Chaos, torture, and certification tooling.
- SilverScript/Toccata behavior beyond the verified OP_TRUE localnet baseline.

Mainnet is not part of the 0.9.6-alpha happy path.
