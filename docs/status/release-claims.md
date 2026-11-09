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
- SilverScript: HardKAS orchestrates the official SilverScript v1.0.0 compiler and the
  Kaspa SDK, and has reproducible real-node evidence for SilverScript P2SH execution
  (including a relative timelock) and a Toccata tx-v1 1:1 auth-bound covenant
  transition against a verified rusty-kaspad 2.1.0. Not claimed: general covenant
  support (leader/cov-bound, N:M, derived state mappings, signed covenant metering),
  production or audited contracts.
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

### Other offline gates

They are not part of `pnpm test`. CI runs only the examples and the gauntlet (state on 2026-11-07, M-03):

| Gate | Needs | State |
| :-- | :-- | :-- |
| `pnpm check:artifacts` | the CLI sources | passes; verifies `packages/artifacts/test/fixtures/valid` under `--strict` with the staleness rule off, so it does not expire |
| `pnpm artifact:corruption` | the CLI sources | passes when every file of `packages/artifacts/test/fixtures/corrupted` is refused, one by one |
| `pnpm templates:verify` | a build | passes (payment-app, batch-payments, local-indexer) |
| `pnpm corpus:toccata`, `pnpm programmability:corpus` | the pinned silverc installed | pass; without silverc they fail with `SILVERC_TOOLCHAIN_NOT_INSTALLED` |
| `pnpm zk:corpus`, `pnpm vprogs:check` | the CLI sources | pass |
| `pnpm docs:check-claims`, `pnpm check:docs`, `pnpm docs:check`, `pnpm docs:check-site` | nothing | pass |
| `node scripts/check-dev-server-security.mjs` | a build | passes; the dev-server API is started with `hardkas sandbox` on a free port |
| `pnpm example:*` (01 to 06) | a build, kaspa-wasm | pass offline; CI runs them in `hardkas-examples.yml` |
| `node scripts/check-typescript-hygiene.mjs` | nothing | advisory only (style, about 170 `catch (e: any)`); not a gate |
| `pnpm gauntlet:toccata` | the canonical Docker localnet | CI runs it in `docker-suites.yml`; not run offline |
| `pnpm qualification:public-npm` | the npm registry | not offline by design |

## Certified Baseline

- Docker `rusty-kaspad` v2.1.0 simnet local node, identity verified (container, image digest, endpoint, network, version).
- Upstream `kaspanet/cpuminer` miner, joined to the node's network namespace.
- Managed toolchains: pinned Kaspa WASM SDK and pinned silverc v1.0.0 release, verified file by file.
- Local funding fixture.
- Standard transaction lifecycle against the local node.
- SilverScript capabilities, each evidenced on its own against the verified node:
  - `silver.compile.v1`: compiled by the managed silverc and reproduced byte for byte.
  - `silver.p2sh.deploy-spend.v1`: P2SH deploy and signed entry spend accepted.
  - `toccata.covenant.auth-1to1-transition.v1`: tx-v1 covenant genesis (SDK covenant id == node) and one 1:1 auth transition with preserved lineage.
- Machine-verifiable golden corpus (`fixtures/toccata-v2/silver`), recorded from real execution.
- Mainnet guard: SILVERSCRIPT_MAINNET_NOT_ENABLED.

The experimental `hardkas silver test` runs contract tests on the official
SilverScript runner and is not part of the baseline: its `vm` records are contract
execution on scenario transactions and never satisfy a compile, deploy, spend,
verify or certification step. HardKAS no longer has a Silver simulator.

## Known Limitation

PARTIAL_VM_SIMULATION remains explicit for the programmability surfaces. HardKAS
does not claim full Kaspa VM or consensus equivalence, vProgs, L2 or audited
contracts.
