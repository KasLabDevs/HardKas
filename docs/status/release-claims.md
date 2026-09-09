# Release Claims and Gates
> **Claims are generated.** The authoritative values live in
> [claims.generated.md](./claims.generated.md), produced from `packages/sdk` by
> `pnpm docs:generate-claims`. Anything restated below is prose, not the source.

Date: 2026-06-23

## Certified Status

LOCAL_FIRST_DEVELOPER_RUNTIME_HARDENED

- local-first: READY
- Toccata v2 localnet: READY
- artifactCoherence: READY_MATCH
- runtimeOutcome: PARTIAL
- vmConsensusEquivalence: NOT_CLAIMED
- corpus verifier: READY
- gauntlet: READY
- SDK parity: READY

## Explicitly Not Claimed (Blocked)

- PRODUCTION_READY: NOT_CLAIMED
- TESTNET_READY: BLOCKED_BY_POLICY
- MAINNET_READY: BLOCKED_BY_POLICY
- L2_READY: NOT_CLAIMED
- BRIDGE_READY: NOT_CLAIMED
- consensus validation
- full VM simulation
- strict simulator-vs-Docker equivalence
- trustless bridge
- on-chain ZK verification
- proof generation correctness
- full vProgs runtime
- stable vProgs API

## Programmability Surface Boundaries

This release adds local programmability surfaces without changing the stable release claims.

Allowed surface claims:
- SilverScript builder: SILVERSCRIPT_BUILDER_READY
- ZK corpus: ZK_CORPUS_SURFACE_READY
- Groth16 corpus fixture coherence: READY_GROTH16_FIXTURE_COHERENCE
- RISC0 inspect-only: RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED
- vProgs artifact inspection: VPROGS_INSPECT_SURFACE_READY
- zkOnchainVerification: NOT_CLAIMED
- vProgsRuntime: NOT_CLAIMED
- vProgsStableApi: NOT_CLAIMED

## Required Release Gates

```bash
pnpm version:check
pnpm build
pnpm test
pnpm docs:check-cli
pnpm packaging:smoke
node packages/cli/dist/index.js --version
node packages/cli/dist/index.js capabilities --json
```

## Certified Baseline

- Docker `rusty-kaspad` v2.0.0 simnet local node.
- Upstream `kaspanet/cpuminer` miner, joined to the node's network namespace.
- Local funding fixture.
- Standard transaction lifecycle against the local node.
- SilverScript OP_TRUE deploy real.
- SilverScript OP_TRUE spend real.
- Simulator deploy/spend.
- silver simulate compare in `artifact-coherence` mode.
- Machine-verifiable golden corpus.
- Mainnet guard: SILVERSCRIPT_MAINNET_NOT_ENABLED.

## Known Limitation

PARTIAL_VM_SIMULATION remains explicit. Strict compare may still show
non-consensus runtime identifier drift. HardKAS does not claim full Kaspa VM or
consensus equivalence.
