# HardKAS 0.9.0-alpha Release Claims

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

## Not Claimed

- mainnet production support
- production custody wallet
- consensus validation
- full VM simulation
- strict simulator-vs-Docker equivalence
- trustless bridge
- testnet/mainnet deployment readiness

## Required Release Gates

```bash
pnpm build
pnpm test
pnpm corpus:toccata
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
