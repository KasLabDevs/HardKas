---
title: Limitations and Boundaries
description: What HardKAS deliberately does not do, and the known gaps in the current release.
---

# Limitations and Boundaries

These are product boundaries, not footnotes. HardKAS is built so that the things
it does not do are visible rather than implied, and so that a workflow fails
loudly at a boundary instead of quietly crossing it.

The machine-readable values behind everything on this page — what is `READY`,
what is `NOT_CLAIMED`, what is `BLOCKED_BY_POLICY` — are generated from the code
in [Release Claims](./claims.generated.md). Read this page for the reasoning;
read that one for the current values.

## What HardKAS is not

| HardKAS is not | Because |
| :------------- | :------ |
| **A wallet** | The keystore exists for local, automated, reproducible workflows. It does not manage seed phrases for end users and is not a place to import mainnet keys. |
| **A custody system** | There are no secure enclaves and no HSM integration. Nothing here is built to hold real capital. |
| **A consensus layer** | HardKAS reaches no distributed agreement. It works offline, trusting the deterministic hash of artifacts on your own disk. |
| **A replacement for a Kaspa node** | Network state comes from Kaspa RPC nodes. HardKAS does not index the global DAG. |
| **A smart-contract VM** | It orchestrates workflows and enforces determinism around external computation. It runs no Turing-complete state machine of its own. |

## What HardKAS is

- A **deterministic transaction workflow layer**: identical inputs on Windows, macOS, or Linux produce byte-identical transactions and hashes.
- An **artifact integrity system**: artifacts cannot be silently mutated, reordered, or replayed out of sequence without detection.
- A **CLI and SDK framework** for building verifiable pipelines.
- A **local-first verification environment** you can exercise fully before touching any real network.

## Product boundaries

### 1. Local-first, with explicit doors to public networks

HardKAS is built around `network: "simulated"`. The certified real-node baseline
is a local Toccata simnet with rusty-kaspad v2.1.0 (pinned by digest). It covers
Docker funding, the standard transaction lifecycle, SilverScript P2SH deploy and
spend through the official silverc v1.0.0, and 1:1 auth-bound covenants.

The boundary differs per network:

| Network | Default | What opens it |
| :-- | :-- | :-- |
| Kaspa L1 **testnet** | closed | `network.allowPublic: true` in `hardkas.config.ts` (which also requires `experimental: true`), or `policy: { allowPublic: true }` when creating the SDK. Once open, the CLI and SDK can plan, sign and send on testnet. HardKAS has not qualified that path for this release. |
| Kaspa L1 **mainnet** | **locked down**: no connection (reads included), no signature, no broadcast | Nothing (MAINNET TOTAL LOCKDOWN, owner decision 2026-11-09, until the product is complete, independently audited and the owner authorizes it). One common layer refuses it before any connection: the endpoint authority (`config/src/endpoint.ts`), the RPC transport (`kaspa-rpc/src/upstream/session.ts`) and `core/src/mainnet-policy.ts` (`MAINNET_CONNECTION_DISABLED`, `MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`). `allowPublic`, `experimental`, `allowMainnet`, an external signer, a direct call or a `HARDKAS_*` variable do not lift it. Only offline operations remain (integrity checks of mainnet records, address derivation), and none produces a signed mainnet transaction. A Toccata ZK spend counts as signed (its signature script is the authorization): `buildR0Groth16Transaction` / `buildR0Groth16Plan` refuse mainnet with `MAINNET_SIGNING_DISABLED`. No mainnet lock is built either (P37): `zk toccata build-scripts` / `buildR0Groth16Scripts` refuse a mainnet address network in any spelling, or a bound payout or change address of mainnet, with `MAINNET_SIGNING_DISABLED` (no address, no signature script). No mainnet key enters the account store (P36): `accounts real generate` and `accounts real import` refuse a mainnet network (any spelling, or a config alias declaring it) and a mainnet address with `MAINNET_SIGNING_DISABLED`; existing accounts are untouched. Limit: an endpoint declared as another network whose node answers mainnet is refused after that one identity answer (`getServerInfo`), with nothing else asked. |
| **L2** mainnet (Igra mainnet, chain id 38833, or any profile marked mainnet; l2 extension) | **locked down**: writes and connections blocked | Nothing. `allowMainnet: true` (SDK) and `--allow-mainnet` (CLI) no longer authorize anything (`packages/l2/src/network-guard.ts`: `L2_MAINNET_WRITE_BLOCKED`; an L2 client bound to a mainnet profile or chain, or whose node answers a mainnet `eth_chainId`, is refused `MAINNET_CONNECTION_DISABLED`). Limit: an unbound L2 client given a raw URL is identified only when it asks `eth_chainId` (every HardKAS L2 write binds a chain). |

Do not route high-value transactions through HardKAS.

### 2. No built-in state machine VM

HardKAS proves artifact determinism and workflow integrity. It does not execute
a general smart-contract VM, so L2 and bridge logic depend on their own runtime.

The Silver/Toccata simulator comparison is an **artifact-coherence** check. It may
report `SILVERSCRIPT_SIMULATION_MATCH` for verified local fixtures, but partial
VM simulation remains explicit. Full Kaspa VM or consensus equivalence is not
claimed.

### 3. The query store is a projection, not the truth

The SQLite query store can lag, be rebuilt, or be corrupted independently of the
artifacts it describes. The filesystem artifacts remain the source of truth. If
the projection drifts:

```bash
hardkas query store sync
hardkas query store doctor
hardkas query store rebuild
```

### 4. Legacy artifacts may be rejected rather than upgraded

Strict readers can refuse older artifacts instead of silently migrating them.
Artifacts of hash version 4 or lower are read with the `LEGACY` authentication
scope, which no decision path accepts. Treat that as a safety barrier: migration
should be explicit and auditable (`hardkas artifact migrate <path> --to 5`), not
implicit.

### 5. The dev-server is mostly observational

The dev-server exposes transaction endpoints, but it is primarily an
observability surface. The canonical local workflow is CLI-first or SDK-first.

### 6. The ZK surface is local-only and experimental

What exists (all `experimental`, no on-chain claim, mainnet `BLOCKED_BY_POLICY`):

- **Fixture coherence** (`zk proof verify`, corpus): manifests, content hashes,
  public inputs and key metadata agree. The digests are unkeyed and live in the
  same directory, so this coherence is **self-attested**: it catches accidents and
  swapped files, never provenance.
- **Groth16 pairing check** (`zk proof verify-math`, snarkjs 0.7.6 over BN254).
  `ZK_GROTH16_MATH_VERIFIED` is returned only when the verification key is
  **anchored**: pinned by the caller (`--expect-vk-hash <fingerprint>`, a value
  obtained from a source you trust) or pinned in code (`PINNED_GROTH16_VERIFICATION_KEYS`).
  A passing pairing against any other key is `ZK_GROTH16_MATH_VALID_UNANCHORED_VK`
  (exit 1): the proof is consistent with that key, whose maker may know its
  trapdoor. The weak-key check is an accident detector, not a boundary.
  Non-canonical encodings, off-curve points and G2 points outside the subgroup are
  rejected before snarkjs.
- **RISC Zero Groth16 receipts** (`zk toccata verify-receipt`): local snarkjs check
  against the pinned RISC Zero verifying key, control root and BN254 control id
  (risc0 v3.0.4, as used by rusty-kaspa 2.1.0). Generic zkVM receipts remain
  inspect-only (`RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED`).
- **Toccata L1 scripts and transactions** (`zk toccata build-scripts`, SDK
  `buildR0Groth16Transaction`): built with the kaspa-wasm 2.1.0 `ZkScriptBuilder`
  for `OpZkPrecompile` (`0xa6`, Groth16 tag `0x20`); never broadcast, and never
  built for mainnet (`MAINNET_SIGNING_DISABLED`: a ZK spend needs no signature, so
  the built transaction would be complete). `zk toccata verify-scripts` accepts a
  lock only over the pinned RISC Zero verifying key, control root and control id,
  and says `consensusEnforced: true` only for an output-bound lock byte-identical
  to the one HardKAS builds for the outputs it carries (payout, change, one input,
  input limit); any other script is `ZK_REDEEM_SCRIPT_NOT_CANONICAL` and gets no
  claim. The receipt's claim is cross-checked against (imageId, journalHash). The
  Groth16 precompile costs 140,000 grams (14,000,000 SU) for the tag plus
  250,000 SU per verifying-key element; the compute budget must cover that
  (minimum 1550 for RISC Zero, default 1600) and fit the 500,000 block
  compute-mass limit.
- **ZK facts** (`hardkas.zkVerificationFact.v1`): records with the real image id,
  the SHA-256 of the proof bytes and no clock in their identity. `verifiedOffChain`
  is set only by HardKAS's own verifier; "not verified off-chain" is not a failure.

Limits that stay:

- **Authorization models.** `IMAGE_ID_ONLY` (`proof-only`, the default): the R0
  lock binds the image id only. Anyone holding a valid receipt of the program
  spends, to any outputs, on any network; replay and front-running are properties
  of this upstream design. HardKAS never returns testnet/mainnet addresses for a
  public test vector, and asks for an explicit acknowledgement otherwise.
  `IMAGE_ID_AND_OUTPUTS` (`proof-and-output-bound`): the redeem script also checks,
  by output introspection, the output count and the payout's (and change's) script
  public key and amount, requires exactly one input, and refuses an input above
  the bound outputs plus `maxFeeSompi`; fund it with `requiredFundingSompi`.
  Anyone with a valid receipt can still trigger that spend, but only to those
  outputs.
- **Not bound in either model:** the spent outpoint (a redeem script cannot name
  it, because the funding transaction's id commits to the P2SH; HardKAS refuses it
  as `ZK_UTXO_BINDING_UNSATISFIABLE`) and the journal (supplied by the unlocking
  script, never checked on-chain). The `HKZ1` layout of
  `createZkOutputBindingJournal` is an off-chain convention: its fields mean
  something only if the guest program enforces them. Binding a proof to its
  transaction beyond the outputs needs another script design and external
  cryptographic review.
- Off-chain (snarkjs) and on-chain (arkworks) verifiers differ in format and in
  validation details; a local VERIFIED does not predict node acceptance. No
  snarkjs Groth16 key is bridged to the precompile.
- On-chain acceptance is evidenced only by the simnet suites against a
  harness-raised rusty-kaspad v2.1.0 (`zk-toccata-l1.simnet`,
  `zk-output-bound-l1.simnet`: the SDK's proof-only and bound spends accepted;
  wrong outputs, two inputs and an oversized input rejected), never on a public
  network.
- No proof generation, no trusted-setup provenance, no bridge or trustless exit.
- `snarkjs` and its curve libraries are GPL-3.0. snarkjs is an optional peer
  dependency of `@hardkas/sdk` and is not installed with it: until it is
  installed next to the SDK, the pairing checks above return the error status
  with `ZK_ENGINE_UNAVAILABLE` (see `packages/sdk/README.md` §7).
### 7. vProgs is inspect-only

The vProgs surface inspects local artifacts and reports capabilities and status.
It claims no vProgs runtime, no API stability, no on-chain ZK verification, no
bridge support, no trustless exit, and no testnet or mainnet readiness.

## Known gaps in this release

### SilverScript: what is real, and what is not proven

SilverScript is no longer simulation-only. `hardkas silver compile` runs the
official silverc v1.0.0, which starts from a verified private copy. `deploy` and
`spend` fund and spend P2SH contracts, and `covenant genesis|transition` build
Toccata transaction-v1 covenants. All of these run against a real rusty-kaspad
v2.1.0 node, with per-capability evidence in `fixtures/toccata-v2/silver`. The
limits:

- only **1:1 auth-bound** covenant transitions are a corpus capability with real-node evidence. 1:N, N:M
  (with a delegate, the signed KCC-20 example included) and termination, built by the SDK's v1 engine, are
  accepted by a real rusty-kaspad on simnet and their invalid variants refused (`covenant-topologies-node.simnet`);
  they are not a corpus capability, have no testnet-10 evidence, and `silver covenant` stays 1:1;
- `deploy`, `spend`, `covenant genesis|transition` and `escrow rescue-v1` run on
  the canonical localnet or on any other node that proves its identity by what it
  reports (`--url`, or the one the workspace declares). Apart from its identity,
  the node must say it is synced, the canonical localnet included
  (`NODE_NOT_SYNCED`). The real-node evidence is simnet (the canonical localnet,
  and nodes of the caller's own) and devnet (an own `rusty-kaspad --devnet` mined
  by the upstream CPU miner); `testnet-<n>` is accepted behind the payments'
  opt-in but has no testnet-10 Silver evidence. Records evidenced by a node
  HardKAS does not manage say `mode: "rpc"` (earlier ones said `localnet`);
- `artifact verify` checks integrity offline on every network (mainnet included,
  offline only) and, on request, the network level (`NETWORK_OBSERVED`) and a
  confirmation by the declared policy (`CONSENSUS_CONFIRMED`, not finality) on a
  node of the artifact's own network. A transaction older than the node's pruning
  point is seen only through an output still in its UTXO set; a spent one, an old
  submission (it names no output) or one beyond the look's read window cannot be
  observed there: `NOT_OBSERVED` with reason `NOT_OBSERVABLE_HERE` and its causes
  (a limitation of that node, never evidence that the transaction does not exist);
  `NOT_FOUND` only when the whole window from a start that precedes any acceptance
  was read. There is no `--address` lookup of spent outputs;
- `hardkas doctor` diagnoses the workspace's node (or `--url` / `--network`): one
  bounded getServerInfo (`--timeout`, default 8000 ms), never mainnet (refused
  without connecting), a public testnet only with the payments' opt-in, the
  canonical localnet only when it is the workspace's node and Docker reports it
  running. It reads what the node REPORTS (network, version, sync, UTXO index):
  a node that lies consistently passes the endpoint checks; only the managed
  localnet is proven by container and image digest. Without a node the diagnosis
  is `partial` and says why;
- the SilverScript runner (`SCRIPT_VM`, cli-debugger) has no official binary to
  pin and is always `UNVERIFIED`. It runs a scenario transaction, not the signed
  one. The `@hardkas/testing` covenant matchers therefore require
  `CONSENSUS_SIMNET` by default and answer "NOT VERIFIED" below it;
- mainnet broadcast of custom scripts stays blocked like any other L1 mainnet send,
  and no Silver or covenant command contacts a mainnet node (MAINNET TOTAL LOCKDOWN).

### The simulator is an approximate model

`@hardkas/simulator` (and the `kaspa-simulator` bin) is **experimental**. It is
useful for fast loops, but its verdicts are not consensus evidence:

- it identifies itself as `2.1.0-kaspa-simulator`; the canonical-node identity
  check refuses it, and `HARDKAS_SIMULATOR` / `HARDKAS_ALLOW_SIMULATOR_NODE` no
  longer have any effect;
- the 2026-11-06 repair aligned its script VM and covenant rules with rusty-kaspa
  v2.1.0: CLTV/CSV with Kaspa semantics, clean stack, push-only signature
  scripts, recomputed genesis covenant ids, coinbase maturity 1000. They were
  checked against a real node on its simnet level;
- known divergences remain. `OpZkPrecompile` and `OpChainblockSeqCommit` fail
  closed. The relay-fee rule and mempool standardness (script class, P2SH sigop
  limit) are not modelled by the validator. Time-based finality uses the wall clock unless a past median time is
  passed. The GHOSTDAG, reorg and accepting-block behaviour is an approximation,
  not a port of consensus;
- **`WrongMass` (the storage-mass commitment) is a known divergence, UNVERIFIED.** The
  simulator replaces the mass a client commits with the storage mass it computes (as the
  node's mempool does, `TxValidationFlags::SkipMassCheck`) and refuses to mine a block
  whose transaction commits another value (`check_mass_commitment`, `TxRuleError::WrongMass`).
  That rule is ported from the rusty-kaspa v2.1.0 source and is tested only against the
  simulator itself (`packages/simulator/test/mass-commitment-sim07.test.ts`). Against a
  real node only the mempool half has evidence, and for HardKAS's own builder, not for
  the simulator: `packages/testing/test/covenant-storage-mass-l1-04.simnet.test.ts`
  shows rusty-kaspad keeping its own mass instead of the one sent, and
  `construction-vectors-node.simnet` V-10 shows the same for a mass committed off by one
  (the mempool replaces it and the node mines the transaction with its own value). The block half has no
  node vector: the simulator accepts no external block, and no simnet suite submits a
  block that commits a wrong mass. A simulator `WrongMass` verdict is not consensus
  evidence;
- confirm anything that depends on timelocks, covenants, mass, fees or ordering
  on simnet before you rely on it.

### HardKAS's own transaction construction against a real node

`construction-vectors-node.simnet` (INT9) builds transactions with HardKAS itself (the
SDK's payment planner and signer, the v1 engine) and lets a rusty-kaspad v2.1.0 on simnet
judge them: txids, fees at the node's minimum (one sompi less is refused), storage mass,
Schnorr signatures, coinbase maturity at the exact DAA boundary, relative time locks
(sequence) and contract signature slots agree with the node. Known gaps:

- a signed **v0 payment commits storage mass 0**, on purpose: payments stay v0 and their
  signed bytes, txids and artifacts do not change (owner decision, 26-oct). The node's
  mempool sets its own value, which is HardKAS's computed one (tx-builder, the node's
  formula), and mines the transaction with it under the same txid: the transaction id does
  not cover the storage-mass field, in v0 or in v1 (official kaspa-wasm 2.1.0). A payment
  sent through a node is therefore unaffected; the signed artifact is not byte-for-byte the
  mined transaction (that one field differs). Evidence: `v0-storage-mass-compat-rc1-d1`
  pins a fixture payment's txid, fee and mass and the committed 0; rusty-kaspad v2.1.0 on
  simnet holds and mines the computed value, with the exact fee, the exact output value and
  the signed txid (`send-sync-v0-mass-rc1.simnet`, `construction-vectors-node.simnet` V-01).
  The v1 engine commits the node's value. Changing the v0 representation needs a new,
  versioned format and the owner's decision; none is proposed for this release;
- HardKAS builds every transaction with **lock time 0** (no absolute time locks, CLTV, in
  this release). `tx.plan({ lockTime })` other than 0 is refused (`LOCK_TIME_NOT_SUPPORTED`;
  it used to be ignored), the CLI has no lock-time option (`UNKNOWN_OPTION`), the signer
  refuses a plan that states another lock time (`LOCK_TIME_NOT_SUPPORTED`; it signed 0), and
  a signed payment bound to its plan whose payload carries another lock time is not the
  plan's transaction (`SIGNED_PLAN_MISMATCH` at send; it was sent). A transaction signed
  elsewhere and sent with `allowUnplannedSignedTransaction` (`--allow-unplanned`) goes to the
  node as it is: HardKAS does not evaluate lock times, the node does. NOT TESTED against a
  node. Design for a later cycle: `docs/proposals/cltv-and-ecdsa-spends.md`;
- the accounts signer signs **Schnorr P2PK only**. Paying an ECDSA address works (V-04, on
  a real node). A spend **from** one is refused, typed, before any UTXO is read or any key
  is used: by the planner (`tx.plan`, `hardkas tx plan`, consolidations) and by the signer
  (`ECDSA_SPEND_NOT_SUPPORTED`). It used to be planned and then fail untyped at the signer
  (`MISSING_INPUT_AUTHORIZER`), or, with a signing authorizer supplied, be signed with
  Schnorr — a transaction the node can only reject. An unlocking script the caller makes
  itself and hands the signer (a signature-script authorization, as for a P2SH input) is
  used as given: HardKAS signs nothing for it. NOT TESTED against a node (nothing HardKAS
  builds reaches one). Same proposal.

### `@hardkas/pskt-native` is on hold

The native PSKT bridge comes with no guarantee:

- its prebuilt binary is built from rusty-kaspa **2.0.1** crates (`Cargo.toml`
  pins rev `78257f27`), not v2.1.0. That PSKT format already carries the
  transaction-v1 covenant fields (`covenantId` on an input's UTXO, `covenant` on an
  output). It has no compute budget: inputs carry only `sigOpCount`;
- it ships for **win32-x64 only**, and its provenance file records no hash of the binary;
- `index.d.ts` is empty: a TypeScript consumer that imports the package does not compile;
- its signer signs with the sighash type the PSKT carries, decides key ownership
  from the PSKT's own derivations and does not review outputs (audit HK-13);
- `hardkas pskt sign` with the native adapter is reported broken (audit TX-09);
- it is not published (`private: true`), and `@hardkas/sdk` does not depend on it
  (L1-CORE-1 B5).

Rebuilding or fixing it is **BLOCKED** while the package is on hold, pending the
owner's authorization. Elsewhere `hasNativeBinding` is false, and the SDK's PSKT
flow uses the kaspa-wasm adapter unless `pskt.registerNativeAdapter()` is called.
`registerNativeAdapter()` loads `@hardkas/pskt-native` from where the SDK is
installed; when it cannot, it returns `false` and the native adapter reports
`NATIVE_ADDON_NOT_INSTALLED`. Since the SDK no longer declares the package, that is
also the case inside this repository for code that runs the SDK's `dist` (the
`labs/bl-001-offline-multisig` and `labs/bl-002-escrow-multisig` suites, outside
every gate).

### Skipped tests that hide known gaps

The canonical gate keeps 11 tests skipped with a `[known gap: …]` label. Each one
documents a defect that is known and not fixed yet. They are listed here so that
none of them reads as a silent pass. `node scripts/check-known-gaps.mjs` fails
when a label in a test file is missing from this table.

| Known gap (label text) | Ticket | Test |
| :-- | :-- | :-- |
| simulated-account guard not enforced without an RPC URL | simulator demotion | `packages/cli/test/tx-simulated.test.ts`, `packages/cli/test/simulated-isolation.test.ts` |
| strict verify rejects golden fixtures (PARENT_MISSING, snapshot ARTIFACT_SCHEMA_INVALID) | evidence core | `packages/cli/test/smoke.test.ts` |
| needs a 'localnet' execution target in hardkas.config.ts | M2-B | `packages/cli/test/localnet-fund-race.test.ts` (whole suite) |
| fee model diverges from node | M4 upstream mass/fees | `packages/sdk/test/fees.test.ts` (2 tests) |
| TxPlan with policy refs fails the integrity check | evidence core | `packages/sdk/test/integration.test.ts` (whole suite) |
| replay verify fails on a signed multisig | evidence core | `packages/sdk/test/multisig-adversarial.test.ts` |
| Hardkas.open connects to the public RPC before the test can inject one | — | `packages/sdk/test/audit-hardening.test.ts` |
| query dag reads .hardkas/state.json, the simulator keeps its DAG in .hardkas/localnet.json | L1-CORE-1-B4 (simulator, frozen) | `packages/cli/test/l1-core-1-b4-query.test.ts` |
| up ignores --json | L1-CORE-1-B4 (needs a design: the dev server's JSON output prints its token) | `packages/cli/test/l1-core-1-b4-up-dev-accounts.test.ts` |

### Test levels: what the canonical gate does not run

`pnpm test` (`vitest.config.ts`) runs `packages/*/test`, `examples/*/test` and
`labs/testnet-runner/test` with no Docker, no node, no silverc and no network.
Everything else runs at its own level, or in no gate at all:

| Suites | Where they run | Why not in the canonical gate |
| :-- | :-- | :-- |
| `*.simnet.test.ts` (packages and examples) | `vitest.simnet.config.ts` (`pnpm test:simnet`); CI: `test-levels.yml`, job `simnet-level` | a real kaspad, started in Docker by the harness |
| `*.silverc.test.ts` (packages and examples) | `vitest.silverc.config.ts` (`pnpm test:silverc`); CI: `test-levels.yml`, job `silverc-level` | the pinned silverc installed in `HARDKAS_HOME` |
| `*.silver-runner.test.ts` | `vitest.silver-runner.config.ts` (`pnpm test:silver-runner`); CI: `test-levels.yml`, job `silver-runner-level`, with a cli-debugger built there from kaspanet/silverscript at the pinned commit | a local SilverScript runner (UNVERIFIED by policy); upstream publishes no binary |
| `*.localnet.test.ts`, `*.e2e.test.ts` | `vitest.localnet.config.ts`, `vitest.e2e.config.ts` | the managed localnet in Docker |
| `*.anvil.test.ts`, `*.foundry.test.ts`, `*.live.test.ts` | their own configs | Anvil, the pinned Foundry assets, public L2 endpoints |
| `labs/bl-001-offline-multisig/*.test.ts`, `labs/bl-002-escrow-multisig/*.test.ts` | no gate (`pnpm --filter @hardkas/example-bl-001-offline-multisig test`) | they write their outputs into tracked files of the lab, load the win32-only `@hardkas/pskt-native` binary (on hold), pin vitest 1.x, and `bl-001-b` / `bl-002-r` start a kaspad in Docker |
| `labs/showcase-suite`, `labs/02-merchant-checkout` | no gate | they have no test files |
| `packages/cli/test/examples-acceptance.node.ts` | `pnpm --filter @hardkas/cli test:examples` (node:test) | outside every gate |
| the example programs 01 to 06 (`pnpm example:*`) | `.github/workflows/hardkas-examples.yml` | programs, not test suites; they run on the in-memory simulator and each one fails its CI step |

The three CI jobs of `test-levels.yml` and the `docs-gates` job of `ci.yml` (the docs
checks, `pnpm version:check`, `pnpm docs:check-apps-cli` and `pnpm check:licenses`) first ran
in CI on 2026-11-09. The `docs-gates` job passed. The three levels, the semantic job, the
Docker suites and the canonical gate on Ubuntu and macOS stopped while installing the pinned
toolchains: GitHub answered anonymous release downloads with 504 that morning, and macOS was
asked for a silverc that is not pinned there. The canonical gate on Windows ran and failed 3
tests, all on the runner's 8.3 short temp path (`C:\Users\RUNNER~1\…`). The examples workflow
failed its typecheck on a checkout with no `dist/`. The fixes (cached toolchains with a
retried download, kaspa-wasm only on macOS, a long-name temp directory on Windows, a build of
`@hardkas/testing` before the simulator's typecheck) have **not** run in CI yet, so none of
those suites has a CI result. The KCC-20 suites of these levels need
`HARDKAS_TEST_KCC20_REFERENCE` (a checkout of argent-lang/kcc20-reference at its pinned
commit, which CI makes) and fail without it.

The simnet harness keeps a node's data in a host directory only when asked: with
`HARDKAS_TEST_SIMNET_DATA_ROOT` (or a suite's `dataRoot`) under that root, and with a
suite's `persistData` and no root under the OS temp directory, which on Windows is on
the system drive. Those directories are left in place for inspection: nothing removes
them. Set `HARDKAS_TEST_SIMNET_DATA_ROOT` to keep node data elsewhere (CI sets it to the
runner's temp directory). With `KASPAD_BIN` (a kaspad binary instead of Docker) the data
goes to the OS temp directory and the harness removes it when the node stops. `HARDKAS_TEST_SIMNET_LABELS` adds `key=value`
labels to every container the harness starts.

The release gates that are not part of `pnpm test` (`pnpm check:artifacts`,
`pnpm artifact:corruption`, `pnpm templates:verify`, the corpora, the docs checks)
are listed with their state in `docs/status/release-claims.md`. The fixture gates
verify the corpus with `HARDKAS_TEST_IGNORE_STALENESS=1`, so their verdict does not
depend on the date; the 30-day staleness rule is tested with an injected clock.

### No L2 production tooling

The L2 extension (`@hardkas/ext-l2`, experimental and, like `@hardkas/l2`, not published in this release) covers
local and test networks (Anvil, Igra Galleon). There is no "deploy to
production" tooling for L2 sequencers or indexers, and HardKAS performs no bridge
operations.

### No mainnet propagation guarantees

A transaction that passes local simulation has been checked for structural and
lineage coherence against HardKAS's own rules. That is **not** a consensus
validity check — `vmConsensusEquivalence` is `NOT_CLAIMED`, and real nodes may
reject a locally valid transaction under their own mempool policies. Test
against Docker `simnet` before drawing conclusions about real-network behaviour.

### Waiting for a transaction sent outside the workspace

A Kaspa node has no lookup of a transaction by id: its acceptance is found by
scanning the node's virtual chain from a chain block before it (the cursor).
`hardkas tx wait <txId>` has one when the workspace recorded the submission, or a
look at the txId (`tx status --since`). For a transaction sent elsewhere it has
none, and the scan starts at the node's pruning point (days of chain on
testnet-10). Two ways in:

- `--since <chain block hash>`: a chain block you know precedes the acceptance;
- `--address <an address it pays>` (INT9 · C3): the scan starts at the node's
  sink when the wait starts, which finds a transaction **accepted after the wait
  started**. Each look that has not found it yet reads the UTXOs at that address:
  an output of the transaction carries the DAA score of its accepting chain block
  (checked on a rusty-kaspad 2.1.0 simnet). Once the target is reached the UTXO
  view is checked at the address, outputs only (the inputs are unknown here).
- a transaction **accepted before the wait started** (RC1 · D2): when that output's
  DAA score is at or below the sink cursor's, the wait walks back from the cursor
  along the node's selected chain (`getBlock`, then the block's
  `verboseData.selectedParentHash`), one chain block at a time, to the first chain
  block whose DAA score is below the output's, and scans the virtual chain from
  there (`getVirtualChainFromBlock` with accepted ids). The acceptance is then the
  node's own chain answer, sealed in the observation like any other: never the
  UTXO row, never the mempool. The walk is bounded: `--lookback <chain blocks>`,
  default 1000, at most 10000, `0` = never walk. Each step is one `getBlock`
  request (under a second for 1000 steps against the loopback stand-in node of the
  tests; a remote node costs one round trip per step). Past the bound, with `--lookback 0`, behind an explicit `--since`
  (never moved), or when the node does not serve a block of the walk, the wait ends
  at once with `TX_WAIT_ACCEPTED_BEFORE_CURSOR`: no state is claimed, and the
  message gives the output's DAA score, the cursor's, the distance, how far the walk
  went and what to pass (`--since <a chain block before that DAA score>`, or a larger
  `--lookback`). `--json` gives `cursor.origin: "lookback"` and `cursor.lookback`
  (the start, the steps, the bound, the output) when the walk found the scan start.
  A wait stores its looks, so a second wait in the same workspace continues the
  stored window forward; an explicit `--lookback` starts again from the sink (the
  remedy the error names works in the same workspace).
  Checked first on a real node: the output's DAA score is its accepting block's, the
  verbose data names the selected parent with `includeTransactions: false`, and the
  chain from the walked-to block names the accepting block (R1 probe, simnet).
- An output spent before it was seen leaves only the forward scan, which then
  times out if the acceptance was before the wait.

Evidence: simnet (rusty-kaspad 2.1.0, `cli-lifecycle.simnet`: a payment accepted
~700 DAA before the watcher's wait is CONFIRMED in the sender's own accepting
block; `--lookback 5` gives the typed error) and a loopback stand-in node
(`tx-wait-address-c3-int9`, C3-1 to C3-8). The bound is in chain blocks: one per
DAA score on a single-miner simnet; fewer than the DAA distance on a busy network.
No testnet-10 evidence.

### Snapshots do not capture remote node state

Snapshot tooling branches, tests, and merges **local** state. Against a real
remote backend such as the RPC plugin, snapshots capture metadata and stubs
only; they do not snapshot the remote node's DAG. Time-travel debugging stops at
the local simulation boundary.

### The RPC backend plugin is a V1

`@hardkas/plugin-rpc-backend` routes `balance()`, `history()`, and `utxos()`
reliably, but has no resilient connection pooling and no retry jitter. If the
node disconnects, restart the script. It is a workspace package: it is not
published in this release ([Versioning](./versioning.md#not-published)).

### Node on Windows: the SDK uses the `ws` WebSocket

HardKAS talks to the node through the official kaspa-wasm `RpcClient`. That
client opens its connection through the global W3C `WebSocket`. With Node's
built-in `WebSocket` on Windows, a process that opens and closes four or more
connections and then calls `process.exit` aborts
(`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`). We reproduced this
with the bare SDK, without HardKAS code. So `@hardkas/kaspa-rpc` sets the global
to the `ws` package's `WebSocket`, as kaspa-wasm's Node instructions do, unless
something else replaced the global after HardKAS loaded. This is a compatibility
shim, not a HardKAS transport: the SDK still drives the connection. It comes out
once the upstream combination is fixed (see
`packages/kaspa-rpc/src/upstream/node-websocket-compat.ts`).

### Rough edges on the start path (found running it as written)

Running [Build on your own simnet](../start/build-on-simnet.md) as written, with
the packages installed from this release's tarballs, found these. None blocks the
path; the start pages work around each one. Four others it found are fixed in
this release: `--state-map` takes a file path too and refuses an invalid value
with `SILVER_ARGS_INVALID`; the plain-text `tx receipt` of a network submission
shows its sender, recipient, amount and fee; a `getMempoolEntry` lookup answered
"not found" is no longer logged as an error; `artifact inspect` of a plan no
longer prints an invented receipt reference.

| Rough edge | Workaround on the start pages |
| :-- | :-- |
| Some refusals print no error code in plain text (`tx send` of an edited artifact, `tx plan` with nothing to spend). | `--json` shows the `code`. |
| `hardkas init` in a directory that already has a `package.json` adds no test script or test dependencies, yet its hint says `npm test`. | The install page adds `@hardkas/testing`, vitest and the script. |
| No CLI command prints an account's x-only public key, which a SilverScript `pubkey` constructor argument needs as a list of bytes. | A short helper reads `.hardkas/accounts.real.json`. |

## Related

- [Release Claims](./claims.generated.md) — the generated, authoritative values.
- [Capability Matrix](./capability-matrix.md) — what a release must prove.
- [Security Claims](./security-claims.md) — what artifact validation does and does not protect against.
- [Versioning](./versioning.md) — which surfaces are stable, preview, or experimental, and how to tell them apart.
