# Release Claims and Gates
> **Claims are generated.** The authoritative values live in
> [claims.generated.md](./claims.generated.md), produced from `packages/sdk` by
> `pnpm docs:generate-claims`. Anything restated below is prose, not the source.

Date: 2026-06-23

## Status verified by the release checks

These are the repository's own checks, not a third-party certification.

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

They are not part of `pnpm test`. Since 2026-11-09 CI also runs the release and docs gates (`ci.yml`, job `docs-gates`: version check, CLI references, claims, docs links, site map, known gaps, forbidden claims, licenses, artifact registry), besides the examples and the gauntlet. The table records each gate's local state:

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
| `node scripts/check-typescript-hygiene.mjs` | nothing | advisory only (style): 187 `catch (e: any)` left on 2026-11-09, no other finding; not a gate |
| `pnpm lint` | nothing | 0 errors on 2026-11-09 (541 `no-unused-vars` warnings); 14 packages have a `lint` script; not in CI yet |
| `node scripts/check-artifact-registry.mjs` | a build | passes; three `hardkas.*` strings that are not artifact schemas (a ZK hash domain tag, two report-script schemas) are allowed only in their own file, with the reason |
| `node scripts/check-release-tarballs.mjs --pack` | `pnpm release:build` (every published `dist/` deleted, built with turbo `--force`) | refuses to pack any other `dist/`, a build made on a tree with uncommitted changes (`RELEASE_BUILD_DIRTY`) or at another commit (`RELEASE_BUILD_WRONG_COMMIT`), a tree with uncommitted changes (`RELEASE_TREE_DIRTY`), a folder git cannot describe (`RELEASE_GIT_UNAVAILABLE`) and a `--dir` holding anything but tarballs (`PACK_DIR_INVALID`); packs the published packages with pnpm and audits each tarball offline (files, exports, README/LICENSE, no `workspace:`, no install scripts, no private paths or tokens in text files including `.jsonl`, `.log` and `.csv`, private packages left out, no file the entry points do not reach: `UNREFERENCED_FILE`, no file outside `dist/` that git does not track: `UNTRACKED_FILE`). The report gives each tarball's `integrity` (sha512) and `publishable`. `--allow-dirty` packs uncommitted changes for local proofs only (`publishable: false`); it never excuses another commit or an ignored file. CI installs exactly these tarballs in its consumer smoke (`packaging:smoke --tarballs`) |
| `pnpm gauntlet:toccata` | the canonical Docker localnet | CI runs it in `docker-suites.yml`; not run offline |
| `pnpm qualification:public-npm` | the npm registry | not offline by design |

## Baseline verified by the release checks

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
