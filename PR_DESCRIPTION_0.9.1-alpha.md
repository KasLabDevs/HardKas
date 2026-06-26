# 0.10.0-alpha SDK parity / developer experience

## Summary

Closes the SDK parity gaps discovered by the 0.10.0-alpha post-release break
gauntlet.

Adds high-level SDK surfaces for capabilities, localnet, corpus verification,
and Silver planning/simulation/compare flows.

No mainnet, testnet, VM/consensus, custody, or trustless bridge claim is added.
Certified real Docker/Toccata lifecycle execution remains CLI/localnet bounded.

SDK real Silver RPC/Docker execution remains explicitly unsupported in
0.10.0-alpha via `SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED`; certified real
lifecycle execution remains CLI/localnet bounded.

## Validation

- `pnpm --filter @hardkas/sdk typecheck`: PASS
- `pnpm --filter @hardkas/sdk test`: PASS, 81 tests
- `pnpm --filter @hardkas/sdk build`: PASS
- `pnpm postrelease:break`: PASS
- `pnpm typecheck`: PASS, 41 tasks
- 20/20 generated apps smoke PASS
- SDK gaps: 0
- unresolved findings: 0

## Claims Kept

- `artifactCoherence`: READY_MATCH
- `runtimeOutcome`: PARTIAL
- `vmConsensusEquivalence`: NOT_CLAIMED
- `mainnet`: BLOCKED_BY_POLICY
