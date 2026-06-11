# HardKAS 0.9.x-alpha Release Claims

Date: 2026-06-09

## Certified

- local-first: `READY`
- Toccata v2 localnet: `READY`
- artifactCoherence: `READY_MATCH`
- runtimeOutcome: `PARTIAL`
- vmConsensusEquivalence: `NOT_CLAIMED`
- mainnet: `BLOCKED_BY_POLICY`
- corpus verifier: `READY`
- gauntlet: `READY`
- SDK parity: `READY`
- SilverScript builder surface: `SILVERSCRIPT_BUILDER_READY`
- ZK corpus surface: `ZK_CORPUS_SURFACE_READY`
- Groth16 fixture coherence: `READY_GROTH16_FIXTURE_COHERENCE`
- RISC0 inspect surface: `RISC0_INSPECT_SURFACE_READY`
- vProgs inspect surface: `VPROGS_INSPECT_SURFACE_READY`

## Not Claimed

- mainnet production support
- production custody wallet
- consensus validation
- full VM simulation
- strict simulator-vs-Docker equivalence
- trustless bridge
- testnet/mainnet deployment readiness
- on-chain ZK verification
- proof generation correctness
- full vProgs runtime
- stable vProgs API

## 0.9.3-alpha Programmability Surface Boundaries

`0.9.3-alpha` adds local programmability surfaces without changing the stable
release claims.

Allowed surface claims:

- SilverScript builder: `SILVERSCRIPT_BUILDER_READY`
- ZK corpus: `ZK_CORPUS_SURFACE_READY`
- Groth16 corpus fixture coherence: `READY_GROTH16_FIXTURE_COHERENCE`
- RISC0 inspect-only: `RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED`
- vProgs artifact inspection: `VPROGS_INSPECT_SURFACE_READY`
- zkOnchainVerification: `NOT_CLAIMED`
- vProgsRuntime: `NOT_CLAIMED`
- vProgsStableApi: `NOT_CLAIMED`
- mainnet: `BLOCKED_BY_POLICY`

Required lab errors:

- `SDK_ZK_ONCHAIN_VERIFICATION_UNSUPPORTED`
- `ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED`
- `ZK_VERIFIER_UNSUPPORTED`
- `ZK_VERIFIER_UNAVAILABLE`
- `ZK_CORPUS_MANIFEST_INVALID`
- `ZK_CORPUS_HASH_MISMATCH`
- `RISC0_VERIFIER_UNAVAILABLE`
- `RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED`
- `VPROGS_RUNTIME_NOT_CLAIMED`
- `VPROGS_STABLE_API_NOT_CLAIMED`

## Required Release Gates

```bash
pnpm build
pnpm test
pnpm corpus:toccata
pnpm zk:corpus
pnpm vprogs:check
pnpm programmability:corpus
pnpm programmability:surface
pnpm gauntlet:toccata
pnpm --filter @hardkas/cli test
git diff --check
```

## Certified Baseline

- Docker `rusty-kaspad` v2.0.0 simnet local node.
- Toccata v2 miner/stratum companion.
- Local funding fixture.
- Standard transaction lifecycle against the local node.
- SilverScript OP_TRUE deploy real.
- SilverScript OP_TRUE spend real.
- Simulator deploy/spend.
- `silver simulate compare` in `artifact-coherence` mode.
- Machine-verifiable golden corpus.
- Mainnet guard: `SILVERSCRIPT_MAINNET_NOT_ENABLED`.

## Known Limitation

`PARTIAL_VM_SIMULATION` remains explicit. Strict compare may still show
non-consensus runtime identifier drift. HardKAS does not claim full Kaspa VM or
consensus equivalence.
