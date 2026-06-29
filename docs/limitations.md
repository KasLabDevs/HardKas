# HardKAS Limitations

This file mirrors the release-boundary summary in `docs/11-limitations.md`.

`0.11.0-alpha` keeps the same stable safety claims:

- `artifactCoherence = READY_MATCH`
- `runtimeOutcome = PARTIAL`
- `vmConsensusEquivalence = NOT_CLAIMED`
- `mainnet = BLOCKED_BY_POLICY`

Programmability ZK and vProgs surfaces are local-only:

- Groth16 corpus verification is fixture coherence only.
- RISC0 is inspect-only unless a future helper is bundled.
- vProgs is inspect-only.
- On-chain ZK verification is `NOT_CLAIMED`.
- Full vProgs runtime is `NOT_CLAIMED`.
- Stable vProgs API is `NOT_CLAIMED`.
- Bridge and trustless exit are `NOT_CLAIMED`.
