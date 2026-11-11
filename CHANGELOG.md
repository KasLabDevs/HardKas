## [0.13.0-rc.2] - 2026-11-11 - Release candidate

- Synchronize the coordinated package versions, runtime identity, scaffolds and current documentation to `0.13.0-rc.2`.
- Keep generated `@hardkas/*` dependencies pinned to the exact CLI version.
- Preserve the published `0.13.0-rc.1` notes and qualification evidence.

## [0.13.0-rc.1] - 2026-11-02 - Covenant engine v1, L2 extension, experimental simulator

Published on npm on 2026-11-10 (22 packages): `latest` and `next` both point to `0.13.0-rc.1`. The
release publishes 22 packages, listed with the reason for each in
[docs/status/versioning.md](docs/status/versioning.md#published-packages); `@hardkas/ext-l2` (never published),
`@hardkas/pskt-native` (on hold), `@hardkas/l2` (until its API is reviewed) and the 8 packages no published package
depends on (`@hardkas/client`, `@hardkas/react`, `@hardkas/wallet-adapter`, `@hardkas/simulator-adapters`,
`@hardkas/plugin-local-indexer`, `@hardkas/plugin-rpc-backend`, `@hardkas/sync-daemon`, `@hardkas/storage-postgres`)
are `private` (L1-CORE-1 B5, INT9 and the pre-release round, below). A project that `hardkas init` scaffolds pins
`@hardkas/*` to this exact version, so it installs from the registry only once all packages are published. Upgrade
notes: [docs/migrations/0.12-to-0.13.md](docs/migrations/0.12-to-0.13.md).

### Breaking
- **Artifact hash version 5.** New artifacts are written with `hashVersion: 5` (`CURRENT_HASH_VERSION`). Artifacts of hash version 4 or lower are still read, but with the `LEGACY` authentication scope. A decision path such as a replay verdict refuses that scope, so re-issue those artifacts with `hardkas artifact migrate <path> --to 5`.
- **Node.js 24.22.1 exactly.** The packages that declare `engines` (root, `@hardkas/cli`, `@hardkas/core`, `@hardkas/testing`, `@hardkas/pskt-native`) require `24.22.1`. `hardkas doctor` passes on 24.22.1, warns on another 24.x and fails on other major lines. Earlier documents said "22.5 or newer" or "18": both were wrong.
- **Dashboard retired.** `apps/dashboard`, its Express server (port 3333), the `runDashboard` export of `@hardkas/cli/public` and the `express` dependency of `@hardkas/cli` are gone. Local development runs headless on `@hardkas/dev-server` (REST, SSE, file watcher, SQLite query store). The CLI no longer registers the `dev-server` command group.
- **`@hardkas/testing` covenant matchers require node evidence by default** (SC-04, in the repair below). `toPassCovenantTransition()` now defaults to `minEvidence: "CONSENSUS_SIMNET"`. `toPreserveCovenantId()` and `toProduceSuccessor()` fail as "NOT VERIFIED" below that level. Pass `{ minEvidence: "SCRIPT_VM" }` to keep the old acceptance on purpose.
- **`hardkas doctor` exits 1 when a check fails** (3-nov L-02, in the integration below). Warnings and skips keep exit 0, and the report is unchanged. A script that ran `doctor` only for its report and ignored failed checks now stops there.
- **`@hardkas/sdk` no longer installs `snarkjs`** (L1-CORE-1 B5, below). snarkjs (GPL-3.0) is an optional peer dependency. Until it is installed next to the SDK, a Groth16 pairing check (`verifyGroth16Math`, `verifyZkProofMath`, `verifyR0Groth16ReceiptLocal`, `hardkas zk proof verify-math`, `hardkas zk toccata verify-receipt`) returns the error status with the issue `ZK_ENGINE_UNAVAILABLE`. Migration: `npm install snarkjs@0.7.6` in the project that uses the SDK or the CLI.
- **Mainnet total lockdown: no connection to mainnet, reads included** (owner decision 2026-11-09; it revokes the read exception of SDK-MAINNET-BROADCAST-GUARD-1, "reading and planning on mainnet stay allowed", and closes the known open item that left it pending). One common layer refuses it before any connection: `assertMainnetConnectionsDisabled` / `MAINNET_CONNECTIONS_ENABLED = false` in `@hardkas/core`, the endpoint authority (`resolveNodeEndpoint` of `@hardkas/config`: a mainnet network — the name asked for or the network its entry declares, `mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case — gets no endpoint, before `--url` or `rpcUrl` is read) and the RPC transport (`@hardkas/kaspa-rpc`: a client used as mainnet never connects; every connection, with or without an expected network, asks the node its network once before anything else and is closed when it answers mainnet, and never reconnects). The new typed code is `MAINNET_CONNECTION_DISABLED`; signing and broadcasting keep `MAINNET_SIGNING_DISABLED` / `MAINNET_BROADCAST_DISABLED` (raised first by their own guards). What changes: `rpc *`, `accounts balance`, `tx plan`, `tx wait`, `tx status` (no look taken), `doctor` (its skip code is now `MAINNET_CONNECTION_DISABLED`, was `MAINNET_NOT_CONTACTED`), `rpc compare`, `localnet fork`, `run`, `kaspa wallet send --dry-run`, Silver (the node of `--network mainnet` and its aliases is `MAINNET_CONNECTION_DISABLED`, was `MAINNET_TRANSACTIONS_DISABLED`; `SILVERSCRIPT_MAINNET_NOT_ENABLED` now covers every mainnet spelling) and, in the SDK, a mainnet instance opens offline (`rpc`, `tx.plan`, observations and waits, `accounts.getBalance`, `fees.estimate`, `observe.address`, `wallet.open`, `node.fundDevWallets`); `WalletToolkit.watch`, `verifyEndpointIdentity`, `readNodeSet`, the dev-server health check and the capabilities' Igra probe never contact mainnet either. A node that answers mainnet where another network was expected is now `MAINNET_CONNECTION_DISABLED` instead of `NODE_NETWORK_MISMATCH`. L2: `allowMainnet: true` / `--allow-mainnet` no longer authorize Igra mainnet writes (`L2_MAINNET_WRITE_BLOCKED`), and an L2 client bound to a mainnet chain, or whose node answers one, is refused `MAINNET_CONNECTION_DISABLED`. No option, flag, environment variable or configuration lifts any of it. Offline operations remain (`artifact verify` of a mainnet record checks integrity, network level `NOT_CHECKED` / `MAINNET_NETWORK_CHECK_BLOCKED`). The one unavoidable limit: an endpoint declared as another network (or a raw `--url`) is known to be mainnet only from its node's identity answer, after which nothing else is asked ([limitations](docs/status/limitations.md), [errors](docs/reference/errors.md#mainnet_connection_disabled)).
- **`tx send` of an already-submitted transaction** (L1-CORE-1 B2, below) answers `outcome: "already-submitted"` with `code: "ALREADY_SUBMITTED"` and sends nothing. It used to say `outcome: "submitted"` with `alreadySubmitted: true`. With `--preflight`, a spent input is `INPUTS_SPENT_UNATTRIBUTED` (it was `INPUT_NOT_UNSPENT`). Without a local record, a payment the node already holds is not sent again either (INT9, below).

### Changed
- Updated the coordinated package versions, runtime identity, scaffolds and current release documentation to `0.13.0-rc.1`.
- Kept scaffolded `@hardkas/*` dependencies pinned to the CLI's exact release version.
- Scoped abbreviated RC comparisons to their release line so historical `0.12.0` references remain valid after the minor-version bump.

### Added
- **Covenant engine v1 (Toccata, transaction v1).** `hardkas silver engine plan|sign`, `hardkas silver covenant genesis|transition|inspect`, and the SDK's `hardkas.covenants` (`planGenesis`, `planTransition`, `planContractDeploy`, `planContractSpend`, `history`, `lineage`, `inspect`, `getState`) plan, check (F1.4), sign with kaspa-wasm and send through the payment preflight. A real rusty-kaspad v2.1.0 node has accepted 1:1 auth-bound transitions, and on simnet also 1:N, N:M and terminating ones (INT9, below). There is no TN10 evidence for the topologies other than 1:1.
- **Transaction version policy.** Payments, batches and consolidations stay transaction v0 by default. v1 is used for covenants or when asked for explicitly (`--tx-version 1`), never as a silent migration.
- **L2 extension (`@hardkas/ext-l2`, experimental).** `hardkas extension install l2` adds the L2 commands, the Igra profiles (`igra-galleon` chain id 38836, `igra-mainnet` 38833; `igra-caravel` deprecated) and managed Foundry (Anvil) and solc toolchains. Like the core toolchains, these are pinned and verified file by file. L2 mainnet writes are refused whatever `allowMainnet` / `--allow-mainnet` say, and Kaspa L1 mainnet is locked down with no flag (see Breaking, "Mainnet total lockdown"). The package is not published in this release (`private`, L1-CORE-1 B5), so `extension install l2` cannot fetch it from a registry yet.
- **`@hardkas/simulator` (experimental) and the `kaspa-simulator` bin.** An in-memory UTXO/DAG simulator with a script VM and a wRPC server. It is an approximate model with known divergences from rusty-kaspa v2.1.0, so its verdicts on timelocks, covenants or mass are not consensus evidence ([limitations](docs/status/limitations.md#the-simulator-is-an-approximate-model)). It identifies itself as `2.1.0-kaspa-simulator`, never as a canonical node.
- **Pinned node.** The local node is `kaspanet/rusty-kaspad:v2.1.0` pinned by digest (`KASPAD_REFERENCE_IMAGE`). The managed toolchains are kaspa-wasm 2.1.0 and silverc 1.0.0.
- **ZK output-bound locks (experimental).** `buildR0Groth16Scripts({ bindingPolicy })` and `hardkas zk toccata build-scripts --mode proof-and-output-bound --payout-address … --payout-amount … [--change-address … --change-amount …] [--max-fee …]` build a lock whose authorization model is `IMAGE_ID_AND_OUTPUTS`: after the Groth16 verifier the redeem script checks the output count and the payout/change script public key and amount by introspection, exactly one input, and an input of at most the bound outputs plus `maxFeeSompi`. Results carry `requiredFundingSompi` and `maxInputSompi`. The default stays `proof-only` (`IMAGE_ID_ONLY`). `hardkas zk toccata verify-scripts` reports which of these rules a script pair enforces. `createZkOutputBindingJournal` writes the `HKZ1` journal layout, an off-chain convention that no lock checks. A real rusty-kaspad v2.1.0 accepts the SDK's bound spend and rejects wrong outputs, two inputs and an oversized input (`zk-output-bound-l1.simnet`); nothing is signed or broadcast by HardKAS. The corrections to the first version are in the integration below.

### Fixed
- Exact integers in on-chain JSON: constructor arguments and covenant state no longer go through a JS number (ISSUE-ONCHAIN-JSON-PRECISION-1).
- `hardkas run` resolves `tsx` from the CLI's own dependencies and runs without a shell (no `npx`, paths with spaces work).

### Fixed in the 2026-11-06 repair (audit HK-xx / counter-audit CA-xx)
- **Simulator identity (HK-01, HK-05; agent S2).** The simulator reports `2.1.0-kaspa-simulator` and no canonical path accepts it. `HARDKAS_SIMULATOR` and `HARDKAS_ALLOW_SIMULATOR_NODE` no longer have any effect. Silver records store the OBSERVED image digest (`node.imageDigest`) plus the new `kind` and `expectedImageDigest` fields (CA-TX-04). The simulator's default port is now 19110, it refuses mainnet and it refuses browser Origins by default. Its relay fee minimum is 100 sompi/gram (it was 1). `acceptedTransactionIds` are now the merged ids, and unknown RPC methods return an error. The help text of `hardkas simulator start` changed (`docs/reference/cli*` must be regenerated).
- **Simulator consensus rules (HK-02, HK-03, HK-08, CA-SIM-01/03; agent S1).** CLTV/CSV follow Kaspa semantics: the Bitcoin pattern `<t> CLTV DROP …` now fails, as on the node. Clean stack and push-only signature scripts are enforced. Genesis covenant ids are recomputed: invented ids are rejected with `WrongGenesisCovenantId`. Script units are required on every input, and coinbase maturity rises from 100 to 1000. Errors carry stable `TX_*` / `SCRIPT_*` codes plus the node's text, with new `code` / `scriptCode` / `usedScriptUnits` fields. `validateTransactionScripts` takes an optional fourth parameter and accepts transactions without outputs (consensus does; the mempool still refuses them). `extractSignatureFromSignatureScript` requires the 0x41 push, and `decodeScriptNum` throws `ScriptError`. 56 of 56 vectors match a real rusty-kaspad v2.1.0 node at the new simnet level. Migration: Bitcoin-style simulator scripts must consume their operand, and tests that invent covenant ids must compute them (`kaspaCovenantId`).
- **Fees (HK-09, CA-TX-01, CA-TX-03, TX-05; agent T).** The default fee no longer overpays. HardKAS passed the 100 sompi/gram minimum to the Generator as a fee rate, and the Generator charged it on the storage mass too; rusty-kaspa v2.1.0 applies the relay minimum to max(compute, normalized transient) mass. A 0.2 KAS payment now pays 203,600 sompi instead of 5,000,000, and a 1 KAS payment 203,600 instead of 1,000,000 (plan hashes change accordingly). A fee rate at or below the minimum means "the minimum". `getFeeEstimate` is read in its real shape (`{ estimate: { priorityBucket, normalBuckets, lowBuckets } }`), `evidence: "dynamic"` only when the node's value was used, and the CLI now asks the node. A node rate above 10,000 sompi/gram (`maxFeeRate`, configurable per network) is refused with `FEE_RATE_ABOVE_BOUND`. A default ceiling of 0.1 KAS per transaction applies at plan, sign and send unless `maxFeeSompi` / `--max-fee` / `networks[<net>].maxFeeSompi` raises it (`FEE_EXCEEDS_MAX`). `calculateDynamicFeeRate` takes an `options` parameter and reports `source`, `nodeFeeRate` and `bucket`; its floor defaults to 100.
- **Send binding (HK-11, CA-TX-02).** `tx.send` requires the signed transaction's plan: `SEND_PLAN_UNRESOLVED`, `SEND_PARENT_NOT_PLAN` and `SEND_PLAN_UNREADABLE` refuse what used to be sent without the plan comparison and the plan's fee ceiling. `allowUnplannedSignedTransaction` (CLI `tx send --allow-unplanned`) is the explicit exception. `sdk.artifacts.verify({ strict: true })` propagates `strict` (hash version ≤ 3 → `migration_required`).
- **Signing policy (HK-12, CA-TX-05).** No `@hardkas/accounts` path signs mainnet: `allowMainnet` on the accounts signer, `KaspaWasmPrivateKeySigner` and the v1 engine is deprecated and has no effect, and the Silver/covenant builders refuse mainnet with `MAINNET_SIGNING_DISABLED`.
- **Native PSKT adapter (HK-13, TX-09).** Without touching `@hardkas/pskt-native` (on hold), the SDK's native adapter refuses before calling the binary any input whose sighash is not SIGHASH_ALL, any input whose UTXO script is not the signing key's, an unknown network and mainnet; its `trustProfile` no longer claims authentication or encryption. `hardkas pskt sign` works again and takes `--inputs`.
- **Planning and addresses (HK-10, HK-14, L1-03..L1-11).** Consolidations leave out immature coinbases (`CONSOLIDATION_IMMATURE_ONLY`) and the CLI keeps `isCoinbase`/`blockDaaScore`; devnet maturity is 1000. Devnet addresses are `kaspadev:`; an unknown network fails closed (`NETWORK_UNKNOWN`); `kaspa:sim_*` is accepted only by the simulator. The Generator planner refuses `version: 1` (`GENERATOR_V1_UNSUPPORTED`). The legacy covenant builders commit storage mass with covenant plurality and pass `covenant_id` to kaspa-wasm. `buildKaspaUri` no longer doubles the prefix. RPC health picks the protocol by scheme and no longer assumes `isSynced: true`. A numeric `amount` warns that it is read as KAS. The dust (600) and 100,000-gram limits are documented as wallet policy, not node rules.
- **Keystore 2.1.0 (TX-07, 3-nov L-01).** New keystores authenticate `network` and `address` as AES-GCM additional data and bound the KDF parameters (`KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS`); 2.0.0 keystores are still read. New codes: `KEYSTORE_UNLOCK_FAILED`, `KEYSTORE_METADATA_MISMATCH`.
- **Dev-server and escrow (TX-06, CA-TX-06).** Auto-signing is the server's decision (`HARDKAS_DEV_SERVER_AUTOSIGN=1` outside the simulator/simnet), never the HTTP client's. `hardkas escrow rescue-v1` shows and signs the same draft and proves the node's network and identity before `broadcast` (`--network`, default the draft's).
- **Send-route documentation (TX-08).** `docs/status/send-routes-security.md` lists every route that ends in `submitTransaction`, `escrow rescue-v1` and unplanned signed transactions included; `security-claims.md` no longer calls an unkeyed hash a "mathematical" protection.
- **Silver records (HK-01, CA-TX-04).** The record schema accepts only a `rusty-kaspad` node `kind` and the new `expectedImageDigest`; a simulator or unverified node no longer validates as a Silver record's node.
- **Merchant compatibility evidence (HK-07, SIM-12, CA-EV-06, CA-EV-07, HK-26).** The v1 battery (`scripts/run-merchant-compatibility-battery.mjs`) is retired: it wrote PASS rows with fixed texts for operations it never ran. The v2 battery records a PASS only for an operation a declared executor ran, with its command, a measured duration, the stored observed response and checks that the semantic checker re-evaluates. Everything else is `NOT_EXECUTED`; `OFFLINE_PASS` and the other non-run statuses are gone. Its node is the reference rusty-kaspad by digest on 127.0.0.1, and each run writes its own directory instead of the repository. The results already in the repository (`logs/`, `merchant-compatibility-*`) are marked as invalid evidence (`logs/README.md`).
- **silverc runs from a verified private copy (SC-02).** `compileSilverScript` and the AST parser hash the pinned silverc, copy those bytes to `HARDKAS_HOME/run/silverc/…`, hash the copy again right before the start and run the copy, never the toolchain path. The SilverScript runner already worked this way. New error codes: `SILVERC_CHANGED`, `SILVERC_START_FAILED`.
- **Covenant matchers (SC-04).** The matchers no longer pass by default on results that no node checked (see Breaking).
- **Hermetic gate (HK-06 / CA-EV-03).** `scripts/gate-hermetic.mjs` refuses loopback connections to 16210, 17210, 18210 and 18211 by default, so a local kaspad or simulator cannot change the gate's verdict. `--allow-local-node-ports` turns this off for diagnosis only.
- **CI (HK-22).** Every workflow installs with `--frozen-lockfile`, pins its actions by commit SHA and runs with `permissions: contents: read`. The canonical gate (`pnpm test`) runs on Ubuntu, Windows and macOS, and the simulator's simnet level runs where CI has Docker.
- **CLI (HK-27).** The `sandbox` banner check accepts the dev-server API line (the `dev-server` command group is no longer registered: see Breaking).
- **Documentation (HK-21, HK-23, HK-25, SC-05, TX-08, L-07, L-10, CA-EV-11).** Fixed: the Node.js requirement everywhere; rusty-kaspad v2.1.0 and hash version 5 in the status and reference docs; the real state of `@hardkas/pskt-native`; covenant and SilverScript status; testnet (`allowPublic`) and L2 mainnet (`allowMainnet`) boundaries; the skipped "known gap" tests listed in `docs/status/limitations.md`; the README `sdk.replay.verify(receipt.contentHash)` example; the local verdaccio token in `.npmrc` commented.

### Fixed in the 2026-11-06 repair · ZK (audit HK-04, HK-16..HK-20, ZK-07..ZK-15; counter-audit CA-ZK-02..07, CA-EV-10)
- **No "verified" without an anchored verification key (HK-04).** `verifyGroth16Math`, `verifyZkProofMath` and `hardkas zk proof verify-math` return `ZK_GROTH16_MATH_VERIFIED` only when the key is anchored: `expectedVerificationKeyHash` / `--expect-vk-hash`, or a key pinned in code (`PINNED_GROTH16_VERIFICATION_KEYS`). Without an anchor a valid pairing returns `ZK_GROTH16_MATH_VALID_UNANCHORED_VK` with `ok: false` (CLI exit 1, `ZK_GROTH16_VK_UNANCHORED`). A valid pairing means "valid against this key"; a key controlled by the prover can always be forged against, and no weakness heuristic can detect that. Migration: pass the key's fingerprint (`summary.verificationKeyFingerprint`) or legacy digest, taken from a trusted source.
- **Canonical points only.** Non-canonical encodings (z ≠ 1, non-canonical infinity), points off the curve and G2 points outside the subgroup are refused (`ZK_POINT_NOT_CANONICAL` / `NOT_ON_CURVE` / `NOT_IN_SUBGROUP`) before the weakness filter and before snarkjs, so the key that is judged is the key that is verified.
- **Renamed.** Binding `FIXTURE_COHERENCE` → `FIXTURE_COHERENCE_SELF_ATTESTED`; claims `GROTH16_SNARKJS_BN254_FIXTURE_BOUND` / `_MATH_ONLY` → `…_PINNED_VK` / `…_UNANCHORED_VK`; capability `SNARKJS_BN254_FIXTURE_BOUND` → `SNARKJS_BN254_PINNED_VK_ONLY`. The corpus pins its key with `pinnedVerificationKeyId` and can no longer grant itself `allowWeakVerificationKey`.
- **RISC Zero receipts (HK-17, HK-19, CA-ZK-03).** New `verifyR0Groth16ReceiptLocal` and `hardkas zk toccata verify-receipt`, with the verification key of rusty-kaspa v2.1.0 (checked against risc0 v3.0.4 `verifier.rs`) and the control root and BN254 control id of risc0 v3.0.4. The claim digest is recomputed from the image id and journal; a mismatch is refused (`ZK_RECEIPT_CLAIM_MISMATCH`). `mathVerified` is deprecated and ignored: only a real local verification sets `offChainVerification`.
- **Toccata lock semantics (HK-16).** Every result states its lock's `authorizationModel` and carries the matching warning. A proof-only lock (the default) carries `ZK_LOCK_BINDS_IMAGE_ID_ONLY`: it is spendable by anyone holding a valid receipt of that program (upstream design). An output-bound lock carries `ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS`. Only the simnet address is returned by default; testnet/mainnet addresses need `addressNetworks` (plus `acknowledgeImageIdOnlyLock` for a proof-only lock) and are never produced for the public vector.
- **Budget and mass (ZK-07, ZK-08).** 250,000 script units per verification-key element; a budget below 1,550 or a compute mass above the 500,000 block limit is refused; the plan uses the measured mass instead of the constant 1602.
- **Facts and statuses (HK-20, ZK-09, ZK-10, ZK-11).** `ZkVerificationFact` records the real image id and the SHA-256 of the proof bytes, no placeholder address, and a `contentHash` that does not depend on the clock. `deriveZkOperationStatus` adds `PROOF_NOT_VERIFIED_OFFCHAIN`, `TX_ACCEPTED` and `SYNTHETIC_ONLY`; `SETTLED` only with a confirmed or finalized transaction. RISC0 content hashes are computed, no fixed "PASS".
- **Inputs (HK-18).** A `null`, `0`, `false` or `""` JSON file, fixture or corpus manifest no longer passes.
- **Licensing note (ZK-14).** snarkjs and seven packages of its tree are GPL-3.0 and were runtime dependencies of the MIT SDK (`packages/sdk/README.md` §7). Resolved in L1-CORE-1 B5: snarkjs is now an optional peer dependency, not installed with the SDK.

### Fixed in the 2026-11-07 integration (develop + origin/main ZK repair + simulator-branch repair)
- **ZK output-bound locks, corrected before release.** The first version of `proof-and-output-bound` bound the payout/change script public key without its version, so no standard output could ever match: funds were unspendable by relay, and only a non-standard output a miner crafts could match. The bound value is now the encoding `OpTxOutputSpk` pushes (version u16 big-endian, then the script). `bindingPolicy.utxoBinding` (CLI `--utxo-txid` / `--utxo-index`) is refused with `ZK_UTXO_BINDING_UNSATISFIABLE`: the funding transaction's id commits to the P2SH, so a redeem script cannot name the spent outpoint. The lock now requires exactly one input and an input of at most the bound outputs plus the fee cap, so merged UTXOs or an oversized deposit can no longer be burnt as fee. An under-funded bound lock is an issue, not a warning. `consensusEnforced` is `true` only for a successful bound build, and the structural verifier requires the one-input and input-limit rules and flags outpoint binding and version-less script public keys. `observeZkSpendOnce` takes the network from the caller or the fact, never a simnet default. Fees fail closed at the cap (`feeOptions.maxFeeSompi`, default 0.5 KAS), including the fee an output-bound lock implies, and plan and fact errors are reported instead of swallowed.
- **ZK documentation (develop's pages).** `concepts/toccata/zk-and-sequencing.md`, `guides/zk-l1-verification-and-settlement.md`, `reference/cli/zk.md`, `static/llms.txt`, `docs/status/limitations.md` §6 and `packages/sdk/README.md` now say what the code does: opcode `0xa6` (not `0xa8`); the Groth16 tag `0x20` costs 140,000 grams plus 250,000 script units per verifying-key element (minimum R0 compute budget 1550, default 1600); the real result fields (`opcode`, `tag`, `groth16PrecompileCostGrams`, `redeemScript`, `sigScript`, `p2shScriptPublicKey`, `requiredFundingSompi`); the two authorization models; no outpoint binding; the `HKZ1` journal as an off-chain convention.
- **`hardkas init` over an existing project (N-2).** The refusal is typed: `PROJECT_ALREADY_INITIALIZED`, exit 1, with `--force` as the suggestion. It was `UNKNOWN_ERROR`. The existing `hardkas.config.ts` is left as it was.
- **`hardkas doctor` exit code (3-nov L-02).** A report with a failed check exits 1; warnings and skips exit 0; the report (human or `--json`) is unchanged. `--strict` still adds `DOCTOR_FAILED`. The `--strict` help text changed (`docs/reference/cli*` must be regenerated). The test that recorded the gap (CLI-CONTRACT-2 C6) runs again.
- **Dev-server session token (3-nov L-09).** The token is never embedded in a response: the HTML injection went away with the retired dashboard, and regression tests now pin that for the default and `--unsafe-external` configurations. Every response carries `Cache-Control: no-store`. The startup banner names the dev-server API and the token file (`.hardkas/dev-server-token`) instead of a dashboard.
- **SDK reference (N-4).** `apps/docs/docs/reference/sdk/generated` is regenerated with TypeDoc from the current sources (it still showed, for example, the old covenant limitations "P82/P84").

### Fixed in L1-CORE-1 (2026-11-07/08: the core lifecycle against a real node, publish preparation)
- **B1 · the CLI against a real kaspad (simnet).** New suite `packages/cli/test/cli-lifecycle.simnet.test.ts` (9 cases, also in `docker-suites.yml`): it runs the built CLI, one process per command, against a rusty-kaspad v2.1.0 the harness raises, with the canonical ports refused and a background miner. Covered: `init`, network config, three encrypted keystores, funding, balance, a payment to CONFIRMED, a double spend refused by the node, a 3/3 batch with no repeated UTXO, a node restart between `send` and `wait` (still CONFIRMED, no new receipt), and every connection on the harness endpoint. The simnet harness (`@hardkas/testing`) keeps the node data on the host (`dataRoot`, `persistData`, `HARDKAS_TEST_SIMNET_DATA_ROOT`), takes extra labels (`labels`, `HARDKAS_TEST_SIMNET_LABELS`), and `restart()` really stops and restarts the same node with its data (it used to kill it); without host data it refuses with `SIMNET_RESTART_NEEDS_HOST_DATA`.
- **B2 · defects found by that use.**
  - `rpc health` and the other `rpc *` commands without `--network`, inside a workspace whose network has a node, use that network's endpoint and identity. On a public network with no endpoint they refuse with `NETWORK_ENDPOINT_REQUIRED` and contact nothing.
  - `hardkas run`: a failing script is `SCRIPT_EXECUTION_FAILED` with the script's error, a missing `@hardkas/testing` or `@hardkas/kaspa-rpc` is `RUN_DEPENDENCY_MISSING`, and `--json` prints one envelope (the script's output goes to stderr).
  - `why` names the role of submissions, observations and migration receipts (H4; it said `Unknown`).
  - `tx send` is idempotent (see Breaking): with a local record it never sends again; without one it asks the node's mempool first; with `--preflight`, a spent input is `ALREADY_SUBMITTED` (IN_CHAIN) when this transaction's outputs are listed, `INPUTS_SPENT_UNATTRIBUTED` otherwise (renamed in INT9).
  - `deploy status --verify` observes the transaction through the SDK observer (virtual chain plus mempool, no TxIndex needed), respects `--json`, and a read failure is `DEPLOYMENT_VERIFY_FAILED` (it printed and exited 0).
  - The frozen toolkit `query-api` no longer reads a `null` from `getTransaction` as "not found": mempool, or `TX_LOOKUP_UNAVAILABLE`.
  - `accounts consolidate` takes `--password-env` / `--password-stdin` (an encrypted account could not be consolidated without a terminal).
  - An unreachable node is `RPC_CONNECTION_FAILED` / `RPC_TIMEOUT`, not `UNKNOWN_ERROR` (N-14).
  - `tx wait` of an external transaction without a cursor (C3) was still open here; INT9 adds `tx wait --address`.
- **B3 · Silver and covenants beyond the canonical localnet.** `silver deploy|spend|covenant genesis|transition` and `escrow rescue-v1 prepare|broadcast` take `--url` and `--network` like `tx *`. The canonical localnet is still proven by container and image digest; any other node by what it reports (network, reference version, synced, not the simulator), else `NODE_IDENTITY_UNVERIFIED` before any key is used. Mainnet is refused; `testnet-<n>` needs the same opt-in as payments. Records of a node proven by its endpoint say `verification: "endpoint"` and carry no container or digest, and the artifact schema accepts them (`networkId` simnet or `testnet-<n>`). `pnpm gauntlet:toccata --url <ws> --node-container <n> --grpc-port <p>` runs the gauntlet against such a node (its own miner, never the canonical one), and both modes now run `artifact verify` on every Silver record they write. Evidence: 16 PASS + 1 SKIP against an own rusty-kaspad v2.1.0 simnet node; 56 of 56 consensus vectors match. No TN10 evidence.
- **B4 · core commands without a test.** 16 commands got tests; all but `localnet start|status` (runner level, Docker mocked) run the built CLI. Fixed on the way:
  - the JSON envelopes of `query replay summary|divergences|invariants` and `query dag conflicts` named another command;
  - `evidence explain`: a JSON file that is not an evidence package is `EVIDENCE_INVALID_SCHEMA` (was `UNKNOWN_ERROR`), and the output now says whether the package verifies (`Verification:`, `result.verification`);
  - `tx compare` read `fees`, so the fee row was always N/A (the field is `feeSompi`);
  - `dag status` wrote `.hardkas/localnet.json` and a snapshot in any directory; it only reads now;
  - `up` in a simulated workspace contacts nothing (it probed 18210) and opens the browser only from a terminal;
  - `localnet fork`: `--network simulated` is `LOCALNET_FORK_SOURCE_SIMULATED`, and a public network without an endpoint is `NETWORK_ENDPOINT_REQUIRED`, nothing contacted;
  - `accounts real change-password` takes `--password-env` / `--password-stdin` and `--new-password-env`; without a terminal or `--new-password-env` it is `KEYSTORE_PASSWORD_REQUIRED` before anything is read;
  - `localnet start` labels the canonical node `hardkas.role=localnet-node` (identity is still container, digest and endpoint);
  - `programmability` help no longer says "Builder-ready".
  Three gaps stay listed in `docs/status/limitations.md`: `query dag` reads `state.json` while the simulator writes `localnet.json`; the fee heuristic of `replay divergences` flags every simulated payment; `up --json` is ignored.
- **B5 · publish preparation.**
  - `@hardkas/pskt-native` is `private`, and `@hardkas/sdk` no longer lists it in `optionalDependencies`. Its binary is win32-x64 only and the package is on hold. The SDK's native PSKT adapter still loads it on demand: without it the adapter is unavailable (`NATIVE_ADDON_NOT_INSTALLED`) and the SDK imports normally. `hardkas pskt` already said "unavailable in this build".
  - `snarkjs` moves from `dependencies` to an optional peer dependency of `@hardkas/sdk` (`peerDependenciesMeta`), and stays a devDependency of the repo. Without it the verifier returns the typed issue `ZK_ENGINE_UNAVAILABLE` (needs the optional peer snarkjs, GPL-3.0, install it next to `@hardkas/sdk`) with the error status, never VERIFIED. Checks that need no engine (schemas, canonical points, the weak-key and pin rules) still run and still reject.
  - `@hardkas/ext-l2` is `private`: it has never been published.
  - The published set was 31 packages (30 after INT9 made `@hardkas/l2` private), listed in `docs/status/versioning.md` with the reason for each. `packages/testing/test/l1-core-1-b5-publish-set.test.ts` pins it and refuses a published manifest that depends on a private package.
  - `scripts/check-packaging-smoke.mjs` takes the version from the root manifest, no longer expects `@hardkas/ext-l2`, and checks from the tarballs that the SDK imports without `@hardkas/pskt-native` and that a Groth16 check without snarkjs is `ZK_ENGINE_UNAVAILABLE`.
  - Rehearsed on a local verdaccio: the 31 tarballs, packed with pnpm 9.15.4 and free of `workspace:`, were published there, then installed from it in an empty project, with every other dependency from npmjs. Covered there: `hardkas init` (simulated), plan, sign, send and receipt, `artifact verify` and `replay verify`, `hardkas pskt capabilities` (unavailable), and the Groth16 fixture without snarkjs (`ZK_ENGINE_UNAVAILABLE`) and with `snarkjs@0.7.6` (the same verdict as in the repository).

### Fixed in INT9 (2026-11-09: develop integration, multi-network verification, rusty-kaspad as the L1 oracle)
- **Network identity, sync and `artifact verify` levels (I-1, I-3).**
  - `@hardkas/core` has a typed network identity (`hardkas.networkIdentity.v1`: family, concrete id, observed id, endpoint, node kind, identity evidence, sync, trust) and `assertNodeSynced`. A node proven by its endpoint no longer records an image digest nobody compared, and being synced is a verdict apart from identity.
  - **Breaking:** a node that does not say it is synced is refused with `NODE_NOT_SYNCED` in `tx plan|send|wait`, `silver deploy|spend|covenant genesis|transition` and `escrow rescue-v1`, the managed localnet included (it was `NODE_IDENTITY_UNVERIFIED`, and for endpoints only). Offline and diagnostic commands do not require it.
  - `hardkas artifact verify` reports `result.levels`: `INTEGRITY_VERIFIED` (offline, on every network, mainnet included), `NETWORK_OBSERVED` and `CONSENSUS_CONFIRMED` (against a node of that network, naming its identity and the confirmation policy; mempool is never confirmation and a simulator never gives consensus), and `NOT_CHECKED` when no node was asked. New options `--network`, `--url`, `--since`, `--min-confirmations` and `--require`. Mainnet is never contacted. SDK: `verifyArtifactOnNetwork` and the `requireSyncedNode` option.
  - Silver records accept `devnet`, and `mainnet` for offline reading only; records written against an endpoint say `mode: "rpc"`, and `node.network` must match `networkId`.
  - Fixed: an endpoint whose `getServerInfo` the client cannot decode made `getServerInfo`/`getInfo` loop forever; `kaspadev:` addresses were not recognised, devnet plans were flagged as corrupted, and imported devnet accounts had no network.
  - Evidence: a payment, Silver deploy → spend and covenant genesis → transition, all `CONSENSUS_CONFIRMED`, on own rusty-kaspad v2.1.0 simnet and devnet nodes; three October TN10 payments verified read-only (`NETWORK_OBSERVED` and `CONSENSUS_CONFIRMED`). No TN10 transaction was sent.
- **A payment the node already holds is never sent again (I-2). Breaking.** `tx send` of a payment with no submission recorded here first asks the node for positive evidence (its mempool, this workspace's stored looks, or an output of the txId listed with the amount and script it pays) and answers `already-submitted` / `ALREADY_SUBMITTED` with `recorded: false`, `state` and `evidence`; nothing is sent. Nothing is inferred from what the node does not list: `NOT_OBSERVED` and `UNKNOWN` let the send go ahead (policy in `docs/status/send-routes-security.md`). A default send reads the addresses it pays once more. With `--preflight`, `INPUTS_SPENT` is now `INPUTS_SPENT_UNATTRIBUTED`. On a real simnet node, a CONFIRMED payment whose local record was deleted was not sent again (submissions counted at the wire).
- **CLI.**
  - `tx wait --address <address>` waits for a transaction sent outside this workspace (C3); one accepted before the wait started ends with `TX_WAIT_ACCEPTED_BEFORE_CURSOR`, claiming no state.
  - `why --tx` / `explain --tx` of a transaction signed here with no submission recorded answer from the signed artifact and its plan, inventing no network state (C4).
  - The CLI-CONTRACT-2B gaps are closed. **Breaking:** `--json` usage errors are one `{ ok:false, code }` envelope with exit 2 (`UNKNOWN_OPTION`, `MISSING_ARGUMENT`, …). Also: `create --json` failures are one envelope with exit 1; an unreachable node is `RPC_CONNECTION_FAILED` / `RPC_TIMEOUT` in `tx plan` and `rpc health` too; `kaspa doctor --json` prints one document; `status` reports a config that cannot load (`CONFIG_LOAD_FAILED`); `ci verify` no longer calls an environment failure a corrupted workspace.
  - `hardkas run` passes the script's output on as it is written and no longer fails a script that prints more than 64 MiB.
  - `silver doctor` and `capabilities` check the node the Silver commands would use (`--url`, `--network`, else the workspace's endpoint), not the canonical localnet only.
  - `accounts real import` records the network of the address it imports (it wrote `devnet` for every non-mainnet address, so an imported simnet account could not sign) and takes `--network`.
  - `tx send` of a signed artifact that does not verify reports the verification's code (for example `ARTIFACT_HASH_MISMATCH`; it was `UNKNOWN_ERROR`).
  - `extension install l2` without `--from` refuses with `EXTENSION_NOT_PUBLISHED` before any package manager runs (it ran npm and failed on a registry 404); the dry run says `published: false`.
- **Covenants and HardKAS's own construction against a real node (simnet).** 1:N, N:M (with a delegate, including the signed KCC-20 example) and terminating transitions built by the v1 engine are accepted and mined by rusty-kaspad v2.1.0; 9 invalid variants are rejected by the engine and the node alike; 4 policy cases are accepted by the engine, which does not run a contract's policy, and rejected by the node. HardKAS's construction matches the node on txid, minimum fee, storage mass, Schnorr signatures, coinbase maturity at the exact boundary, relative time locks and the v1 fee floor (`covenant-topologies-node.simnet`, `construction-vectors-node.simnet`). No TN10 evidence.
- **Publishing. Breaking:** `@hardkas/l2` is `private` (provisional owner policy, until its API, dependencies and promises are reviewed), so the release publishes 30 packages. Every published package ships a `README.md` and a `LICENSE`, and no text recommends installing a package this release does not publish. `pnpm check:licenses` writes `docs/status/dependency-licenses.md`: only snarkjs (GPL-3.0, an optional peer) and its tree are copyleft. Without snarkjs, `zk proof verify-math`, `zk toccata verify-receipt` and `zk corpus verify` fail with `ZK_ENGINE_UNAVAILABLE` (exit 1, as before). Rehearsed again from the 30 tarballs on a local verdaccio, including a payment to CONFIRMED and `artifact verify` → `CONSENSUS_CONFIRMED` against an own simnet node.
- **Docs, CI and tests.** The apps/docs CLI pages are generated and checked (`docs:generate-apps-cli`, `docs:check-apps-cli`). New CI workflow `test-levels.yml` (silverc, the SilverScript runner built from the pinned silverscript commit, simnet, the KCC-20 reference) and a `docs-gates` job; `kcc-levels.yml` is gone. They have not run on CI yet. `HARDKAS_TEST_SIMNET_PORT_RANGE` bounds the simnet harness's host ports. The simulator's `WrongMass` is documented as a known, UNVERIFIED divergence; the simulator is frozen and unchanged.

### Fixed in RC FINALIZATION-1 (2026-11-09: release candidate preparation)
- **What the mainnet perimeter covers, said exactly.** The RC oracle found, with a loopback decoy, that `rpc info`, `rpc health`, `accounts balance` and `tx plan` read from a mainnet endpoint the user declares, while the start pages and `doctor` said HardKAS never contacts mainnet. That reading was allowed by the policy ratified then (SDK-MAINNET-BROADCAST-GUARD-1, MG-C2); the owner has since decided to block mainnet reads too, and the read exception is revoked (see Breaking, "Mainnet total lockdown"): the same decoy now sees zero connections from every one of those commands. For mainnet, `PUBLIC_NETWORK_BLOCKED` no longer suggests `allowPublic`, which does not enable it.
- **The SDK refuses an unsynced node when it sends. Breaking (SDK).** `tx.send` (and `covenants.send`, account and workflow sends, which go through it) refuses, on a real network, a node that does not say it is synced (`isSynced: true`) with `NODE_NOT_SYNCED`, before any read the send depends on and before anything is sent or recorded, as `hardkas tx send` already did. rusty-kaspad v2.1.0 accepts a submission while it says it is not synced, so the refusal is HardKAS's. The only escape is explicit and local: `tx.send(signed, { allowUnsyncedNode: true })` on simnet or devnet (`SEND_UNSYNCED_NODE_NOT_ALLOWED` elsewhere); mainnet stays refused first. The development facade `sdk.wallet.open` (simnet only) does not check sync yet.
- **`tx wait --address` finds a transaction accepted before the wait started. Breaking (CLI).** A bounded walk back from the node's sink along its selected chain (`--lookback <chainBlocks>`, default 1000, at most 10000, `0` = never) reaches a chain block before the output, and the acceptance is the node's own virtual-chain answer from there. Past the bound, with `--lookback 0` or behind an explicit `--since`, it still ends with `TX_WAIT_ACCEPTED_BEFORE_CURSOR`, and the message gives the output's DAA score, the cursor's, the distance and what to pass. On a real node a payment 779 DAA old was found in the same accepting block as the sender's wait.
- **Unsupported constructions are refused with a code. Breaking.** A spend from an ECDSA P2PK address is `ECDSA_SPEND_NOT_SUPPORTED` before any UTXO is read (it failed untyped, or was signed with Schnorr when a signing authorizer was supplied); `tx.plan({ lockTime })` other than 0 is `LOCK_TIME_NOT_SUPPORTED` (it was ignored), the signer refuses a plan stating another lock time, and a signed payment whose payload carries another lock time is `SIGNED_PLAN_MISMATCH` at send. Paying to an ECDSA address is unchanged. A design for both is in `docs/proposals/cltv-and-ecdsa-spends.md` (not implemented).
- **v0 compatibility is pinned.** Vectors fix the txid, fee and mass of a fixture v0 payment and that its committed storage mass is 0 (v1 commits it); against rusty-kaspad the node keeps and mines HardKAS's computed mass (9,701) under the signed txid. The v0 format does not change.
- **`hardkas doctor` diagnoses the workspace's node.** Sections `local-config`, `connectivity`, `network-identity`, `sync` and `capability` (`--flow payment,silver,covenant`), one bounded `getServerInfo` (`--timeout`), a typed `code` per check and a stable JSON document (`hardkas.doctor.v1`, with `diagnosis: full | partial`). It never contacts mainnet, contacts a public testnet only with the payments' opt-in, probes the canonical localnet only when it is the workspace's node, and a workspace with its own RPC node does not need Docker. `silver doctor --json` adds `node.notSynced` and `node.code`.
- **`artifact verify` never reads a limitation as absence.** What a node cannot show (unsynced, pruned, outputs spent, a submission with no outputs) is `NOT_OBSERVABLE_HERE` with its `causes` and the chain `window` it read; `NOT_FOUND` only when absence is established. It called a confirmed transaction `NOT_FOUND` when asked of an unsynced node.
- **Typed errors.** SDK: a tampered artifact is `ARTIFACT_HASH_MISMATCH` (`sign` checks the plan hash before the fee); only immature coinbase outputs is `NO_SPENDABLE_UTXOS` with `immatureCoinbase`. CLI: the plain-text `tx receipt` of a network submission shows its sender, recipient, amount, fee and change (it printed `unknown`, and `none` for a payment with change) and a State section saying what the submission recorded and that the current state comes from `tx status`; `artifact inspect` of a plan no longer invents `undefined.receipt.json`; `silver covenant transition --state-map` takes a JSON file path too, and an invalid value is `SILVER_ARGS_INVALID`; a `getMempoolEntry` lookup answered "not found" is logged at debug level, not as an error after every send.
- **CI and release.** Every action is pinned to a full commit SHA and runs on Node.js 24, with `permissions: contents: read`; toolchain installs restore from the Actions cache and retry only transient download failures (on 2026-11-09 GitHub answered release downloads with 504); macOS no longer asks for silverc, which has no darwin pin; Windows jobs use a long-name temp directory; `turbo.json` builds `@hardkas/testing` before `@hardkas/simulator`'s typecheck, so `pnpm typecheck` passes on a fresh clone (the Examples workflow failed there). New `scripts/check-release-tarballs.mjs` and CI job `release-tarballs`; it found `@hardkas/storage-postgres`'s `module` naming a file the build does not emit (fixed). `pnpm lint` reports no errors. `check-artifact-registry` passes. `pnpm docs:check` checks every local link again (its pattern skipped any link containing h, t or p); the six broken links it then found are fixed. Release notes draft: `docs/release/0.13.0-rc.1-notes.md`. The canonical-mode gauntlet of `docker-suites` passes again (it failed on CI since the INT9 merge): its doctor checks a clean workspace of its own pointed at the canonical localnet (on a fresh checkout the repository root has no `.hardkas/`, and the doctor, which exits 1 on a failed check, stopped the run with `WORKSPACE_DIR_MISSING`), and its real-node phase funds the fixture by what it can spend, not by its balance (the node warm-up leaves it only immature coinbase). Reproduced and verified in an isolated Docker-in-Docker copy of the job on Linux. The canonical gate's tests account for macOS, where they had never run before: they compare paths by the temp directory's real path (`/var` is a symlink to `/private/var`, and the CLI reports resolved paths), and on a platform where silverc, Foundry or solc has no pin they expect the typed refusal (`SILVERC_PLATFORM_UNSUPPORTED`, `TOOLCHAIN_PLATFORM_UNSUPPORTED`) instead of "not installed". Two product defects that only those runners showed are fixed: `sdk.artifacts.verify(<path>)` and `sdk.artifacts.migrate(<path>)` called a file of a workspace opened through a symlink or junction (every temp directory on macOS) "outside the workspace" (`PATH_TRAVERSAL`, reported as `missing_artifact`), because the file's real path was compared with the root as written only; it is now compared with the root's real path too, as the artifact store and resolver already did, and a link that leads out of the workspace is still refused. And on macOS the managed process manager (the L2 extension's local node) did not read a process's command line, so a record copied onto another process with the same identity but other arguments was reported running (F-03 held on Windows and Linux only); it now compares the whole command line `ps -ww -o args=` prints with the recorded binary and arguments (ps keeps no argument boundaries, so arguments that join to the same text cannot be told apart there). The CI build step (`ci.yml`, canonical gate and semantic test) runs `turbo build` without writing turbo's local cache, which CI never reuses (`--cache=local:r`), with streamed logs and no telemetry, and on the Windows runner tries a failed build once more: twice turbo exited 1 there right after a task had built cleanly, on trees that built on every other job; a real compile error still fails both attempts.
- **Release packing from a clean build (RC2).** New `pnpm release:build` (`scripts/release-build.mjs`): it deletes every published package's `dist/`, builds them with `turbo --force` (no cached output is restored over older files) and stamps the sha256 of every `dist/` file and a hash of each package's build inputs; `scripts/check-release-tarballs.mjs --pack` packs only a `dist/` that matches that stamp (`RELEASE_BUILD_MISSING`, `RELEASE_BUILD_MISMATCH`, `RELEASE_BUILD_STALE` otherwise). Every audit now flags a tarball file the manifest's entry points do not reach (`UNREFERENCED_FILE`): it found the 539 KB of stale chunks in the RC rehearsal's CLI tarball (now 294 KB) and the never-reachable CommonJS builds of `@hardkas/client` and `@hardkas/storage-postgres`, which are now ESM only, as their manifests already declared. `@hardkas/jobs`, `@hardkas/query-store` and `@hardkas/simulator-adapters` delete `dist/` before `tsc`, like every other published package, so turbo's cache never stores a leftover. The CI job `release-tarballs` uses the release build.
- **Mainnet refusals carry the lockdown's own code on every route (RC2 oracle).** The decision is taken first, before the network name is resolved and before the public-network gate (`packages/cli/src/mainnet-guard.ts`): `tx plan|status|wait`, `localnet fork` and `run` give `MAINNET_CONNECTION_DISABLED`, `tx send` `MAINNET_BROADCAST_DISABLED` and `tx sign` `MAINNET_SIGNING_DISABLED` for every spelling (`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case), an alias that declares one, and outside a workspace. They used to give `UNKNOWN_NETWORK`, `RUN_NETWORK_UNKNOWN`, `EXECUTION_NETWORK_MISMATCH`, `PUBLIC_NETWORK_BLOCKED`, `ACCOUNT_NOT_FOUND` or, in `tx send` shortcut mode, `TX_SEND_FAILED`; nothing was contacted either way. `tx wait` on mainnet ends at once with `MAINNET_CONNECTION_DISABLED` as the envelope's `code` (it polled until `--timeout` and ended with `TX_WAIT_TIMEOUT`). `silver deploy|spend|covenant transition` with an alias that declares mainnet give `SILVERSCRIPT_MAINNET_NOT_ENABLED` (was `SILVER_NETWORK_NOT_SUPPORTED`) before any record is read. An endpoint declared as another network whose node answers mainnet: `escrow rescue-v1 prepare` and node-runner's `requireNodeIdentity` / `requireEndpointIdentity` fail with `MAINNET_CONNECTION_DISABLED` (was `NODE_IDENTITY_UNVERIFIED`), `hardkas doctor` names it as the network-identity check's code and the diagnosis headline (was `NODE_NETWORK_UNKNOWN`), and `sdk.fees.estimate` raises it instead of returning the relay minimum. **Changed:** `tx status` on mainnet fails (non-zero exit, `code: MAINNET_CONNECTION_DISABLED`) instead of exit 0 with `INSUFFICIENT_EVIDENCE` (`--no-observe` still takes no look); a mainnet `tx send` without `--yes` is refused, not asked to confirm; `escrow rescue-v1 prepare --network mainnet` gives `MAINNET_CONNECTION_DISABLED` (exit 3), as an alias does (was `MAINNET_BROADCAST_DISABLED`, exit 1). **Added:** `@hardkas/kaspa-rpc` `checkKaspaRpcHealth` / `waitForKaspaRpcReady` take `expectedNetworkId`; a mainnet network is refused before any connection, and the readiness wait returns that refusal at once.
- **Start path for new developers.** `docs/start/` gains "Build on your own simnet": install, an own rusty-kaspad by digest and a miner, quickstart (CLI and SDK), SilverScript deploy → spend and covenant genesis → transition, how to read receipts and levels, what works and where it was verified, and common errors. Every command was run as written against an own node with the packages installed from the release tarballs. Two pages that called simnet a simulation and coinbase maturity 100 blocks are corrected.

### Fixed after RC2 (ZK review: H1, H2, H3, H5 of the crypto review)
- **No complete mainnet ZK spend is built (H5). Breaking (SDK).** A ZK spend carries no signature: its signature script (journal hash, proof, redeem script) is the authorization, so `buildR0Groth16Transaction` with `networkId: "mainnet"` returned a complete transaction any tool could broadcast, with only the warning `ZK_MAINNET_BUILD_UNGUARDED`. It and `buildR0Groth16Plan` (and `sdk.zk.toccata.buildTransaction` / `buildPlan`) now throw `MAINNET_SIGNING_DISABLED` for every mainnet spelling (`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case), before the scripts or the UTXO are read, as the L1 and covenant signers do. The warning code is gone. The CLI builds no ZK transaction. Offline address derivation was left unchanged here: `zk toccata build-scripts --address-network mainnet` still returned a lock's mainnet P2SH address; it is refused since step 4 of the surface audit (P37, below).
- **`verify-scripts` pins the RISC Zero verifier (H1).** `verifyR0Groth16Scripts` / `hardkas zk toccata verify-scripts` accepted a lock over any verifying key: a foreign lock with a trapdoor key and the right image id was `ok: true`. The key handed to `OpZkPrecompile` must now be `R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX`, and the script must push the pinned control root and BN254 control id; otherwise `ZK_VERIFYING_KEY_NOT_PINNED` (or `_NOT_FOUND`), `ZK_CONTROL_ROOT_NOT_PINNED`, `ZK_CONTROL_ID_NOT_PINNED`, with `verifyingKeyPinned`, `controlRootPinned` and `controlIdPinned` in the result.
- **`consensusEnforced` by byte-exact reconstruction (H2).** It was inferred from the presence of introspection opcodes: `OpTxOutputCount` followed by `OP_DROP` passed, only the first output's script and amount were decoded, and the change was never read. The verifier now reads the image id, the outputs and the input limit back from the script, rebuilds it with the same builder `buildR0Groth16Scripts` uses (now one function) and compares the bytes (`redeemScriptCanonical`); only an identical output-bound lock over the pinned verifier is `consensusEnforced`, and only then are `enforces*` and `bound*` set, including the new `boundChangeSpk`, `boundChangeAmount`, `boundOutputCount` and `boundMaxInputSompi`. Anything else is `ZK_REDEEM_SCRIPT_NOT_CANONICAL`. New expectations `expectedChangeAddress` / `expectedChangeAmount` (CLI `--expected-change-address` / `--expected-change-amount`; `ZK_BOUND_CHANGE_SPK_MISMATCH`, `ZK_BOUND_CHANGE_AMOUNT_MISMATCH`, `ZK_BOUND_CHANGE_MISSING`). Expected outputs asked of a lock that binds none (proof-only) are `ZK_EXPECTED_BINDING_NOT_ENFORCED`; they used to pass vacuously. The `verify-scripts` help text changed (`docs/reference/cli*` regenerated).
- **Upstream crate named correctly (H3).** A comment in `toccata.ts`, the official RISC Zero fixture's README and the generated SDK page said there is no `kaspa-txscript-zk-sdk` package; the crate exists (2.1.0, crates.io). HardKAS does not use it: it uses the same builder compiled into kaspa-wasm.
- Tests: `packages/sdk/test/zk-crypto-review-h1-h2-h5.test.ts` and `packages/cli/test/zk-verify-scripts-pinning.test.ts`, red before these fixes. Their controls do not rest on the code under test: the official lock is the one rusty-kaspad v2.1.0 accepted a spend of (`evidence.json` `redeemScriptHash`), the pinned key, root and id are located in it byte by byte, the output-bound tail is assembled from opcode numbers, and the hostile scripts are byte edits of real ones.

### Fixed after the surface audit
- **Cheap cleanup (step 1: P27, P29, P30, P32, P33, P34, P43). Breaking (exports).** Two `exports` entries that resolved to nothing are gone: `@hardkas/kaspa-rpc/adapters` (an empty module since its re-exports were archived in 0.11; the build no longer emits `dist/adapters`) and the `"./*"` pattern of `@hardkas/query` (it pointed at `dist/*.js`, but the build emits only `dist/index.js`); `@hardkas/accounts/internal/wasm-rpc-serialization.js` works and stays. The three `console.log("[DEBUG] …")` lines in `LoadBalancedRpcProvider.getVirtualChainFromBlockV2` and the SDK's observer backend selection no longer print (the first printed an RPC payload); the `getVirtualChainFromBlockV2` methods stay, because the QRY-03 qualification gate and a lab call them, and the SDK README no longer says the observer uses them (it reads `getVirtualChainFromBlock`). `env check` (and `doctor`'s environment check) now knows `HARDKAS_DEV_SERVER_AUTOSIGN` (a policy warning when `1`), `HARDKAS_DEV_SERVER_URL` (tests), `IGRA_RPC_URL` and the obsolete `HARDKAS_EXPERIMENTAL_L2` (`obsolete: true` in the JSON); the `HARDKAS_DEV_SERVER_` prefix is no longer exempt, so a misspelt dev-server variable is `ENV_UNKNOWN_VARIABLE` (exit 2) instead of passing. `HARDKAS_NETWORK` is described as what it is (set by `hardkas test` and `hardkas run`; no package reads it), and the dev server's `POST /mine` loses its always-true `=== "simnet" || true` check with its behaviour unchanged. Unreachable code removed, each file with its consumers checked: `cli/src/commands/bridge.ts` (imported, never registered since 0.12.0-rc.12) with its runner, `cli/src/commands/dev-server.ts` and `runDevServerToken`, the six `accounts-real-{balance,import,list,remove,show,utxos}-runner.ts` that only tests imported (their test removed; the isolation flow keeps `accounts real init`), and `sdk/src/pending-spends.ts`; `testing/src/{fuzzing,utxo-fuzzer}.ts`, which nothing published imported, moved to `packages/testing/test/`. Docs: the impossible deep import and the wrong `@hardkas/client` / `HardkasProvider` description (`docs/reference/client.md`, `docs/start/installation.md`, `docs/guides/sdk-wallet.md`), and the simulated ledger (`network: "simulated"`, `@hardkas/localnet`) told apart from `@hardkas/simulator` in `what-works.md`, `build-on-simnet.md`, `limitations.md` (the PSKT bridge's v1 fields) and the landing page's DAG section (no GHOSTDAG runs on that path).
- **Honest results (step 2: P8–P14, P17–P19). Breaking (JSON output, exit codes, an option's short flag, SDK and artifact types).** No command says OK, verified, schema-valid or consensus-validated without the evidence for it. `rpc compare` with no node reachable is `ok:false`, exit 1, `MULTINODE_NO_NODE_REACHABLE`, naming each node and why (it was `ok:true`, exit 0); with nodes answering the report is unchanged. `lock clear` exits 1 with `LOCK_CLEAR_NOT_CONFIRMED` when the confirmation is declined or stdin ends (it returned exit 0; a confirmation prompt that reaches EOF is now a refusal everywhere instead of a promise that never settled). The five `query dag` views fail with `DAG_DATA_UNAVAILABLE` (exit 1, `status: "NO_DATA"`) instead of an empty `ok:true` answer: they read `.hardkas/state.json`, which no command writes (the simulated ledger's DAG in `localnet.json` holds no transactions, so it is not used); `capabilities` no longer reports `ghostdagSimulation` or `dagConflictResolution` (both keys removed from `HardkasCapabilities`). `programmability inspect|verify` results carry `artifactEvidence: { realNodeEvidence: "NOT_ESTABLISHED" }` instead of the product's constant claims, so a freshly compiled record no longer reads as node evidence; the claims stay in `programmability capabilities` and the corpus report. `artifact create` writes `schemaValidation: "NOT_VALIDATED"` instead of a fixed `schemaValid: true` (its content hash changes accordingly). `localnet snapshot create --consensus-validated` is refused as a usage error (`SNAPSHOT_CONSENSUS_VALIDATION_UNSUPPORTED`, exit 2) and `createSnapshot` refuses that scope for every caller. `query replay divergences|invariants` are labelled static analysis (envelope `analysis`; the invariant fields are now `contentHashMatches`, `stateHashesPresent`, `stateChangeMatchesStatus`, `utxoCountsNonZero`, with `analysis: "static"`), and the fee check is the node's relay minimum on the compute mass of the receipt's plan (`planRelayMinimum`, new in `@hardkas/artifacts`) instead of `fee > 10 × mass`, which flagged every payment at the standard rate. `-h` is the help again in `simulator start` and `sandbox` (the host is `-H, --host`); `init` writes and prints `HARDKAS_VERSION`. Options that change nothing are named on stderr (`OPTION_NO_EFFECT`) and in the JSON envelope (`noEffectOptions`) when given, never removed: `tx plan|sign|send --wait-lock/--lock-timeout`, `tx sign --allow-mainnet-signing` and `accounts consolidate --allow-mainnet` (mainnet stays blocked), `init --template/--accounts`, `up --json`, `localnet start --detached`, `localnet fork --json`, `session create --json`, `node logs --follow`, `test --watch/--mass-*`, `chaos --isolate/--profile` and `chaos replay --isolate`; `dag simulate-reorg --depth` that is not a whole number is a usage error (`DAG_DEPTH_INVALID`).

- **Data protection (step 3: P1, P2, P3, P5, P20, and the last schema verdict of step 2). Breaking (CLI behaviour and options, JSON output, an environment variable made obsolete).** No command loses a configuration, a backup, an account entry or a file outside a directory it created. `query artifacts inspect` (and the explanations of `query artifacts list --explain`) report `integrity.schemaValid` only when the artifact parses with the schema the artifact schema registry holds for it, the one `hardkas verify` applies (`validateArtifactSchema` and `artifactSchemaValidatorFor`, new in `@hardkas/artifacts`), with `schemaValidation: VALID | INVALID | NOT_VALIDATED` beside it; a known schema name no longer makes an artifact schema-valid, and `list --explain` no longer states a fixed hash match. `config init`, `config repair` and `dev init` write a config that imports nothing (the old templates imported `@hardkas/config`, which a project does not depend on, so none of them loaded) and load it before keeping it; an existing `hardkas.config.*` of any name is never shadowed by a new `hardkas.config.ts`; `config init --force` copies the original to a backup first; a backup never overwrites another file (`.backup`, then `.backup.1`, …), so `config repair` run twice keeps the user's original (the second run used to overwrite `.backup` with its own template); `config repair` repairs the config the loader reads, whatever its name; `config init` no longer pre-declares `alice` (DEF-2). `accounts real init --force` refuses a store that holds accounts (`REAL_ACCOUNT_STORE_NOT_EMPTY`, nothing changed) unless the new `--discard-accounts` confirms it, and copies every store it replaces to a backup first (it emptied the store silently, with no copy); a second init without `--force` is the typed `REAL_ACCOUNT_STORE_EXISTS`. `chaos` and `chaos replay` run in a new directory of their own under the OS temp dir and delete only the workspace they created there; the reports stay in `<run dir>/reports` (they deleted `./.hardkas-chaos` and `./.hardkas-chaos-workspace` in the current directory without asking, and their actors ran inside the user's project); `--unsafe-current-dir`, `--force-ci-chaos` and `--force-chaos-destructive` have no effect (`OPTION_NO_EFFECT`: the current-directory mode never ran) and `HARDKAS_ALLOW_UNSAFE_CHAOS` is obsolete. `torture matrix` and `torture replay` run their cases in a temporary directory of their own (they deleted `.hardkas/telemetry/telemetry.jsonl` and pre-cleaned `.tmp/<case>` directories in the current directory); the telemetry stream is appended to and never cleared, the heatmap reads only the run's own events, and the report stays at `.hardkas/reports/torture-<seed>.json`, so CI's call and upload are unchanged. `dev tx send` sends: it applies the confirmation policy of `tx send` (none on the simulated ledger or a local simnet), so on those targets it plans, signs and sends, and on the simulated ledger it says "executed on the simulated ledger", never "submitted" (it failed on every run with `TX_SEND_NOT_EXECUTED`); any other target is refused with `DEV_TX_SEND_NETWORK_NOT_LOCAL` (exit 3) before anything is planned, naming `hardkas tx send … --yes`; `status` suggests it only for those targets. `verify-semantics` keeps refusing (`VERIFY_SEMANTICS_UNSUPPORTED`): its help now says so, `--ci-mode` is a named no-effect option, the refusal names `hardkas verify`, and the landing page no longer presents it as the cross-subsystem check.

- **Security closures (step 4: P36, P37, P38 with P35, P39). Breaking (CLI behaviour, options' effect, SDK, dev-server HTTP API).** While mainnet is locked down, no path of these four makes a mainnet key, a mainnet lock or a server-side signature off the local worlds, and `node start` runs only a pinned image; every refusal comes before anything is read, written or started. `accounts real generate` and `accounts real import` refuse a mainnet network in any spelling (`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case; `--network MAINNET` and `kaspa` used to produce a mainnet key), a config entry that declares one (an alias such as `prod`) and, on import, a mainnet address (`kaspa:`, which named mainnet by itself), with `MAINNET_SIGNING_DISABLED` (exit 1), before any key or password is read: Kaspa's sighash does not commit to the network, so a mainnet key in the store could sign a manipulated plan. No `HARDKAS_*` variable lifts it; existing accounts and keystores are untouched; `PLAINTEXT_MAINNET_FORBIDDEN` stays behind it. `zk toccata build-scripts --address-network` accepts `testnet-10` only: every mainnet spelling is `MAINNET_SIGNING_DISABLED` (exit 1, before the receipt is read), and so is a `--payout-address` or `--change-address` of mainnet; `buildR0Groth16Scripts` (and `sdk.zk.toccata.buildScripts`) throws the same for a mainnet `addressNetworks` entry or a bound address of mainnet, so no mainnet P2SH address and no signature script (the authorization of a ZK spend) is returned. The dev-server signs with its own accounts for an HTTP client (`POST /api/tx/send` with `allowDevAutoSign`, and now `POST /api/tx/sign` too, for the server's network and for every network the client's plan names) only when its environment sets `HARDKAS_DEV_SERVER_AUTOSIGN=1` (off by default: the simulated ledger and simnet auto-signed for any client before), and then only on the simulated ledger or a local simnet (declared simnet, loopback node endpoint); testnet-10, devnet and mainnet are `DEV_AUTOSIGN_NOT_ALLOWED` before anything is planned (with the variable set it signed on testnet-10), and mainnet is recognised in every spelling and alias (P35: the checks compared with the literal `"mainnet"`, so `kaspa-mainnet` reached the planner). `env check` describes and warns about the variable accordingly. `node start` runs only an image pinned by digest (`<repository>[:tag]@sha256:<64 hex>`), from `--image` or from `HARDKAS_KASPAD_IMAGE`: otherwise `NODE_IMAGE_DIGEST_REQUIRED` (exit 2) before the lock or Docker is touched (a tag used to run, and `--allow-floating-image` even allowed `:latest`); `--allow-floating-image` has no effect (`OPTION_NO_EFFECT`). The help of the options involved changed (`docs/reference/cli*` regenerated). Tests: `accounts-real-mainnet-p36`, `zk-build-scripts-mainnet-p37` (CLI and SDK), `dev-autosign-p38`, `node-start-image-digest-p39`, hermetic (mocks, a recording fake `docker`, no network).

- **Pre-release round (owner order, 2026-11-10): the publish set and two evasion routes of step 4. Breaking (publishing, dev-server HTTP API, CLI behaviour).**
  - **Publishing. Breaking:** `@hardkas/client`, `@hardkas/react`, `@hardkas/wallet-adapter`, `@hardkas/simulator-adapters`, `@hardkas/plugin-local-indexer`, `@hardkas/plugin-rpc-backend`, `@hardkas/sync-daemon` and `@hardkas/storage-postgres` are `private`: no published package depends on them (the surface audit's inventory, §1.1 and §1.4; `@hardkas/client` also cannot send the dev server's access token). This release publishes no version of them, so it publishes 22 packages instead of 30. They stay workspace packages, and the monorepo's labs, reference apps and showcase apps keep using them. `docs/status/versioning.md` lists them under "Not published" with the reason for each; `l1-core-1-b5-publish-set.test.ts` and `pnpm version:check` pin the 22, `scripts/check-release-tarballs.mjs` refuses to pack any of the 8 (`MUST_BE_PRIVATE`), the packaging smoke checks none was packed, and their READMEs open with "Not published in this release.". `docs/start/installation.md` no longer recommends `@hardkas/client` or `@hardkas/react`; the published READMEs of `@hardkas/sdk`, `@hardkas/dev-server` and `@hardkas/jobs`, the capability matrix, the apps/docs package map and architecture pages and the landing page say they are not published.
  - **Dev-server escrow routes. Breaking (HTTP API):** `POST /api/escrows/:id/fund` (the buyer's development account signs the funding) and `POST /api/escrows/:id/sign` (a role's development account signs the spend) signed with the server's own accounts for any HTTP client without `HARDKAS_DEV_SERVER_AUTOSIGN`. They now take the same server decision as `POST /api/tx/send` and `/api/tx/sign` (P38), through the same function (`serverAllowsDevAutoSign`, moved unchanged to `dev-server/src/routes/dev-autosign.ts` and re-exported by `dapp-tx.ts`): off by default, opened only by `HARDKAS_DEV_SERVER_AUTOSIGN=1` in the server's environment, and then only on a local simnet (these routes always use the canonical localnet as simnet). Without it they answer HTTP 403 `DEV_AUTOSIGN_NOT_ALLOWED` before the escrow record, any account or key is read and before the node is contacted. `env check` describes the variable accordingly. Test: `dev-server/test/escrow-autosign-route-f.test.ts` (refusal, every value but `1`, an unknown id, and a funding sent once with the variable); the escrow route tests set the variable.
  - **`kaspa wallet create` on mainnet. Breaking (CLI):** `kaspa wallet create --network mainnet --show-private-key` generated and printed a mainnet private key with its `privateKeyEnv` snippet. Like `accounts real generate|import` (P36), it now refuses every mainnet spelling (`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case) and every config entry that declares one (an alias such as `prod`) with `MAINNET_SIGNING_DISABLED` (exit 1), with or without `--show-private-key`, in JSON mode too, before the key generator runs and before the key-output choice (`WALLET_KEY_OUTPUT_REQUIRED`, whose ways out are refused on mainnet as well): no key, no address, nothing written. No `HARDKAS_*` variable lifts it; simnet and testnet-10 are unchanged. The help of `--network` changed (`docs/reference/cli*` regenerated). Test: `cli/test/kaspa-wallet-create-mainnet.test.ts`; `secret-surface-2` and `secret-surface-2-wallet-create` now show the key-output contract on simnet and testnet-10.

### Known open items
- v0 payments commit storage mass 0 and the node replaces it with the value HardKAS computes; the format is kept for compatibility (pinned by vectors).
- HardKAS cannot build an absolute lock time (CLTV) and does not spend from ECDSA addresses (refused with a code; proposal only).
- `sdk.wallet.open` (simnet-only development facade) sends without checking sync; the CLI and `tx.send` do.
- On a public testnet, `tx plan` does not ask for the public-network opt-in that `tx send` and `tx status` require. (Mainnet reads, the other half of this item, are closed: see Breaking, "Mainnet total lockdown".)
- An unreachable node is reported with different codes by different commands (none invents state).
- Mainnet refusals share their typed code, but not their exit code: 1 for `tx *`, `run` and `localnet fork`, 2 for Silver, 3 for `escrow`. The SDK's `Hardkas.open({ network: "kaspa" })` is `UNKNOWN_NETWORK`, not a mainnet code (it is refused either way).
- The `README.md` and `LICENSE` in the tarballs keep the checkout's line endings (the repository has no `.gitattributes`): packed on Windows they are CRLF.
- `pnpm lint` passes with warnings and is not a CI gate yet.
- `@hardkas/pskt-native` is on hold and not published: its binary is built from rusty-kaspa 2.0.1 crates, ships for win32-x64 only, has an empty `index.d.ts`, and its signer is permissive (HK-13). It comes with no guarantee ([limitations](docs/status/limitations.md#hardkaspskt-native-is-on-hold)).
- ZK: the off-chain (snarkjs) and on-chain (arkworks) verifiers differ; `bn254.ts` and the output binding still need an external cryptographic review. snarkjs is an optional peer dependency now; whoever installs it takes on its GPL-3.0 tree.
- ZK: a lock's script public key does not depend on the network, so whoever encodes it as a mainnet address offline can fund a lock HardKAS built for simnet or testnet-10 on mainnet. HardKAS builds no mainnet address, signature script or spend of it (P37, H5).
- Mainnet keys outside the CLI's key commands (found by the step 4 evasion review; none signs or sends, every signing and broadcast path refuses mainnet): a `hardkas.config.ts` account may still declare a `kaspa:` address with `privateKeyEnv` or a key; the `@hardkas/accounts` library still generates or imports a mainnet key when called directly (`KaspaSdkKeyGenerator`, `KeystoreManager.createEncryptedKeystore`, `importRealDevAccount`); and a key is not bound to a network (G6: imported with its `kaspatest:` or `kaspasim:` address it cannot be told apart).
- `sdk.node.start()` and `DockerKaspadRunner` still accept a `HARDKAS_KASPAD_IMAGE` without a digest; the digest rule covers `hardkas node start` (P39).

### Preserved Evidence
- Previous release reports, qualification records and captured corpus artifacts retain their original version identities.
- The merchant-compatibility results of 2026-11-03/04 stay in the repository, marked as invalid evidence, until the owner authorizes their removal.

## [0.12.0-rc.29] - 2026-10-25 - Coordinated Release Identity Refresh

### Fixed
- Promoted the coordinated release-set identity from `0.12.0-rc.28` to `0.12.0-rc.29`.
- `0.12.0-rc.28` on npm was packed from stale build outputs and does not carry the code of its release commit; `0.12.0-rc.29` is the same source, published from a clean build.
- Kept the scaffold invariant intact: `CLI release X -> scaffolded @hardkas/* dependencies = exact X`.

### Preserved Evidence
- `0.12.0-rc.28` records (the earlier CHANGELOG sections) remain historical and are not rewritten as `0.12.0-rc.29`.

## [0.12.0-rc.28] - 2026-10-24 - Coordinated Release Identity Refresh

### Fixed
- Promoted the coordinated release-set identity from `0.12.0-rc.27` to `0.12.0-rc.28`.
- Kept the scaffold invariant intact: `CLI release X -> scaffolded @hardkas/* dependencies = exact X`.
- Preserved historical rc.27 records while creating rc.28 release surfaces.

### Preserved Evidence
- `0.12.0-rc.27` records (the earlier CHANGELOG sections and captured test records) remain historical and are not rewritten as `0.12.0-rc.28`.

## [0.12.0-rc.27] - 2026-10-07 - Coordinated Release Identity Refresh

### Fixed
- Promoted the coordinated release-set identity from `0.12.0-rc.26` to `0.12.0-rc.27`.
- Kept the scaffold invariant intact: `CLI release X -> scaffolded @hardkas/* dependencies = exact X`.
- Preserved historical rc.26 audit and tarball evidence while creating rc.27 release surfaces.

### Preserved Evidence
- `0.12.0-rc.26` audit and tarball evidence remain historical records and are not rewritten as `0.12.0-rc.27`.

## [0.12.0-rc.26] - 2026-09-29 - Coordinated Release Identity Refresh

### Fixed
- Promoted the coordinated release-set identity from `0.12.0-rc.25` to `0.12.0-rc.26`.
- Kept the scaffold invariant intact: `CLI release X -> scaffolded @hardkas/* dependencies = exact X`.
- Preserved historical rc.25 release validation and audit evidence while creating rc.26 release validation surfaces.

### Preserved Evidence
- `0.12.0-rc.25` release validation and audit evidence remain historical records and are not rewritten as `0.12.0-rc.26`.

## [0.12.0-rc.25] - 2026-09-28 - Coordinated Release Identity Refresh

### Fixed
- Promoted the coordinated release-set identity from `0.12.0-rc.24` to `0.12.0-rc.25`.
- Kept the scaffold invariant intact: `CLI release X -> scaffolded @hardkas/* dependencies = exact X`.
- Preserved historical rc.24 release validation and audit evidence while creating rc.25 release validation surfaces.

### Preserved Evidence
- `0.12.0-rc.24` release validation and audit evidence remain historical records and are not rewritten as `0.12.0-rc.25`.

## [0.12.0-rc.24] - 2026-09-28 - Coordinated Release Identity Refresh

### Fixed
- Promoted the coordinated release-set identity from `0.12.0-rc.23` to `0.12.0-rc.24`.
- Kept the scaffold invariant intact: `CLI release X -> scaffolded @hardkas/* dependencies = exact X`.
- Preserved historical rc.23 release validation and audit evidence while creating rc.24 release validation surfaces.

### Preserved Evidence
- `0.12.0-rc.23` release validation and audit evidence remain historical records and are not rewritten as `0.12.0-rc.24`.

## [0.12.0-rc.23] - 2026-09-17 — Coordinated Release Identity Refresh

### Fixed
- Promoted the coordinated release-set identity from `0.12.0-rc.22` to `0.12.0-rc.23`.
- Kept the scaffold invariant intact: `CLI release X -> scaffolded @hardkas/* dependencies = exact X`.
- Updated programmability corpus expectations now that the experimental vProgs inspect-only surface verifies successfully.

### Preserved Evidence
- `0.12.0-rc.22` release validation and audit evidence remain historical records and are not rewritten as `0.12.0-rc.23`.

## [0.12.0-rc.22] - 2026-09-16 — Scaffold Version Coherence Remediation

### Fixed
- Enforced the scaffold release invariant: `CLI release X -> scaffolded @hardkas/* dependencies = exact X`.
- `hardkas init` and template-based scaffolds now derive `@hardkas/*` dependency versions from the installed `@hardkas/cli` package version instead of emitting mutable npm dist-tags.
- Static templates now use a non-installable placeholder for `@hardkas/*` dependencies and are normalized by the scaffolder at generation time.

### Preserved Evidence
- The external-consumer qualification finding for `0.12.0-rc.21` remains historical evidence and is not rewritten as `0.12.0-rc.22`.

## [0.12.0-rc.21] - 2026-06-29 — The First Local-First Application Runtime
> **Notice:** `0.11.0-alpha` was published partially due to a registry collision and has been superseded by `0.12.0-rc.21`. `0.12.0-rc.21` is the official release.

### Migration Note 0.12.0-rc.21
**Strict Separation of Concerns in the TX Pipeline:**
The `tx.send` method no longer implicitly handles partial plan objects to enforce deterministic evidence paths.

**Incorrect (0.10.x):**
```ts
const receipt = await hardkas.tx.send({
  from: "dev-0",
  to: receiverAddr,
  amountSompi: "100000000"
});
```

**Correct (0.12.0-rc.21):**
```ts
// 1. Explicitly request the plan with strong typing (BigInt)
const plan = await hardkas.tx.plan({
    from: "dev-0",
    to: receiverAddr,
    amount: 100000000n // using native BigInt
});

// 2. Firm deterministic signatures
const signedArtifact = await hardkas.tx.sign(plan);

// 3. Broadcast the signed payload
const receipt = await hardkas.tx.send(signedArtifact);
```

### Added
- **Backend Plugin Architecture**: Introduced `@hardkas/plugin-rpc-backend` (V1) to transparently connect `IndexerToolkit` to real Docker `simnet` and `testnet` nodes without altering the SDK facade.
- **Native BigInt Standardization**: All monetary values (balances, fees, amounts) and consensus values (blue scores) are now strongly typed as `bigint` across all Toolkits to eliminate floating-point imprecision.
- **Performance Baselines**: Comprehensive benchmarking (`tinybench` via `vitest bench`) established for massive DAG ingestion (50k blocks), UTXO consolidations (50k outputs), and Jobs throughput (>5M ops/sec).
- **DX & Documentation**: Completely revamped onboarding with `ZERO_TO_APP_WALKTHROUGH.md` and explicit `known-limitations.md`. `hardkas init` templates now correctly use the `bigint` standards.

### Fixed
- Fixed WebSocket drop errors on Windows Docker environments by ensuring safe fallback behavior in the RPC backend loop.
- Ensured snapshots capture clear metadata stubs when utilizing an external RPC backend where complete DAG cloning isn't feasible.

### Validated
- Full gauntlet (build, test, docs, templates, packaging) successfully verified across 36 internal workspace packages.
- Docker long-run continuous stress tests confirmed no major heap leaks in local orchestrations.

## [0.12.0-rc.21] - 2026-06-27 — Toolkit Baseline
### Added
- `@hardkas/toolkit` — High-level facade: WalletToolkit, PaymentToolkit, IndexerToolkit, JobsToolkit.
- `@hardkas/jobs` — Local-first job runner with progress, checkpoints, and retry (no Redis/BullMQ).
- `DomainStoreJson<T>` in `@hardkas/query-store` — Generic domain persistence primitive.
- `InvoiceStoreJson` in `@hardkas/toolkit/stores` — Domain-aware invoice persistence.
- Official templates: `wallet-backend`, `merchant-checkout`, `payment-service`, `full-stack-demo`.
- Builder Book v2: 8 chapters following the real development journey.
- API examples in `docs/examples/api/` for all four Toolkits.
- `API_SURFACE_TOOLKIT_BASELINE.md` — Public API snapshot for future compatibility tracking.

### Fixed
- Coverage infra ENOENT: `coverage/internal/.tmp/` now pre-created in `vitest.config.ts`.
- `docs:verify-book` preflight check ensures `pnpm build` ran before executing book blocks.

### Validated
- Labs 01–09.5 validated the complete SDK lifecycle.
- Full release gauntlet (build, test, docs, templates, packaging) passes with exit 0.

## [0.12.0-rc.21] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.12.0-rc.21.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.12.0-rc.21] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.12.0-rc.21.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.12.0-rc.21] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.12.0-rc.21.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.12.0-rc.21] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.12.0-rc.21.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.12.0-rc.21] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.12.0-rc.21.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.12.0-rc.21] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.12.0-rc.21.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.12.0-rc.21] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.12.0-rc.21.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.12.0-rc.21] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.12.0-rc.21.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.

# HardKAS 0.12.0-rc.21 Release Notes

**Status:** `LOCAL_FIRST_DEVELOPER_RUNTIME_HARDENED` (Release Candidate)

This release concludes a major phase of local-first developer runtime hardening (P1 through P6). The goal of this phase was to ensure that developers have a deterministic, reproducible, and secure experience when building Kaspa-native applications locally against a simulated docker node (Toccata).

We explicitly do **NOT** claim `PRODUCTION_READY`, `TESTNET_READY`, `MAINNET_READY`, `L2_READY`, or `BRIDGE_READY`. Those networks remain `BLOCKED_BY_POLICY` for the happy path. 

## Milestones Achieved

- **P1: JSON Normalization & Mode Labels**
  All CLI outputs are now strictly JSON-compliant. A reality mode label (`SIMULATED`, `LOCAL_DOCKER`, etc.) is guaranteed on all outputs so orchestrators know the precise execution context.
- **P2: Capability Matrix & Documentation**
  Explicit tracking of what HardKAS can do, what modes are supported, and crucially, what is *not* claimed. The documentation boundaries are now clear.
- **P3: Localnet Funding UX**
  Implemented safe local-first shadow identities (`alice.localnet`). Developers can now smoothly fund accounts against the local Docker instance (`localnet fund alice`) without mutating or risking their primary Kaspa keystores.
- **P4: Reality Labels Across Transactions**
  Strict isolation between simulated transactions and real local docker transactions. Developers always know exactly where a transaction was planned, signed, and broadcasted.
- **P5: E2E Docker TX Lifecycle**
  A complete and fully verified transaction lifecycle against the Toccata localnet Docker container. From starting the network to funding, planning, signing, sending, querying the balance, and tearing down safely.
- **P6: Reproducible Install & Recovery**
  Hardened the system against sudden failures. The system cleanly manages state via a query store and correctly recovers gracefully from abrupt container terminations. Key handling enforces strict `0600` file permissions and redacts secrets from all JSON logs to prevent leakage in CI pipelines. 
- **P7: Version Boundary Alignment**
  A synchronized `0.12.0-rc.21` version line across all packages, generated capabilities schemas, CLI help menus, and documentation.

## Core Commitments
If you are building locally, HardKAS provides a safe and deterministic sandbox. If you are aiming for Mainnet or Testnet, those flows require custom guards and are deliberately outside the standard developer workflow provided by this release.


# Changelog

All notable changes to HardKAS will be documented in this file.

## 0.12.0-rc.21 - Deployed & Builder-Ready - 2026-06-11

HardKAS `0.12.0-rc.21` has successfully passed the Extreme Builder Gauntlet. This release marks our transition from raw engineering pipelines into a fully usable **Builder Layer** experience for Kaspa.

### Key Highlights
- **100% External Consumer Validation**: This release was completely verified from outside the monorepo, consuming the actual NPM registry packages.
- **Robust Localnet & Docker Integration**: Flawless detached node lifecycle (`hardkas localnet start --toccata --detached`), auto-funding (`hardkas localnet fund`), and tx simulation.
- **Query Store Safety**: The query store backend now aggressively blocks any unsafe local mutations.
- **Dev-Server Auth**: The dashboard local API is secured via bearer tokens (`dev-server token --json`) and enforces strict host validations.
- **Zero Raw Exceptions**: The entire CLI and SDK surfaces guarantee clear, structured error codes with deterministic JSON outputs.

### Fixes & Refinements since 0.9.3
- Addressed all CLI frictions reported during dogfooding.
- Ensured trailing whitespaces and strict semantic consistency across `vProgs` and `ZK` corpus boundaries.
- Upgraded testing harnesses to guarantee no forbidden protocol claims leak into the `alpha` CLI output.

## 0.12.0-rc.21 - CI Fixes + Query-Store SQL Repair - 2026-06-11

TypeScript typecheck fixes across CLI silver commands and query-store SQL
parameter binding. No new features, no protocol claim expansion.

Fixes:
- `HardkasCliError` options now accept `cause?: unknown` (runners fix)
- `silver.ts`, `silver-lifecycle.ts`, `silver-discovery.ts`: TS errors resolved
  (dead code, `createTransaction` 7-arg signature, `requestRaw` private cast,
  `provider` not in `HardkasOptions`, nullish guards)
- `tx.ts`: `writeLine()` → `writeLine("")`
- `query-store/indexer.ts`, `backend.ts`: `HardkasSchemas.*` in SQL strings
  replaced with `?` parameterized queries
- `core/test/registry.test.ts`: circular `@hardkas/artifacts` import removed
- Golden `queryResultHash` updated to reflect correct `findTraces` output

### Release Discipline Fixes
- `bump-version.mjs` must not rewrite golden corpus fixtures or cryptographic artifact JSON.
- Golden corpus artifacts remain content-addressed and version-stable unless an intentional hash migration is documented.
- Gauntlet/test workspaces must generate their own `hardkas.config.ts` to avoid accidental parent-directory configuration discovery.

### Final Audit State
- `DEEP_AUDIT_COMPLETED`
- `DOGFOODING_FINDINGS_TRIAGED`
- `DOGFOODING_MINOR_FIX_APPLIED`
- `DOGFOODING_REGRESSION_TESTS_READY`
- `FULL_LOCAL_GAUNTLET_PASS`
- `POSTRELEASE_BREAK_PASS`
- `GIT_DIFF_CHECK_PASS`
- `HARDKAS_0_9_3_ALPHA_DOGFOOD_READY`

## 0.9.1-alpha - SDK Parity + Programmability Builder Surface - 2026-06-10

### SDK Parity

`0.9.1-alpha` is a developer-experience patch for the previous Toccata
local-first baseline. It does not add mainnet, testnet, new protocol claims, or
VM/consensus equivalence.

Added SDK parity surfaces:

- `await hardkas.capabilities()`
- `await hardkas.localnet.status({ profile: "toccata-v2" })`
- `await hardkas.localnet.start({ profile })`
- `await hardkas.localnet.fund("alice", { profile })`
- `await hardkas.corpus.verify("fixtures/toccata-v2/silver")`
- `await hardkas.silver.compile({ file })`
- `await hardkas.silver.deployPlan({ artifact, from })`
- `await hardkas.silver.deploy({ artifact })`
- `await hardkas.silver.spendPlan({ receipt, args, to })`
- `await hardkas.silver.spend({ artifact })`
- `await hardkas.silver.simulate.deploy(...)`
- `await hardkas.silver.simulate.spend(...)`
- `await hardkas.silver.compare(...)`

### Boundaries Kept

- `artifactCoherence`: READY_MATCH
- `runtimeOutcome`: PARTIAL
- `vmConsensusEquivalence`: NOT_CLAIMED
- `mainnet`: BLOCKED_BY_POLICY

SDK Toccata Docker funding/start and real Silver RPC deploy/spend remain bounded
in `0.9.1-alpha`; the SDK returns explicit unsupported statuses/errors for
those host-runtime actions instead of pretending consensus or Docker control
parity. CLI/localnet remains the certified path for Docker Toccata real
lifecycle execution.

SDK real Silver RPC/Docker execution remains explicitly unsupported in
`0.9.1-alpha` via `SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED`; certified real
lifecycle execution remains CLI/localnet bounded.

### Programmability Builder Surface

Added a local-only programmability builder surface with SDK parity. It covers
SilverScript builder workflows, ZK corpus fixture coherence, and vProgs artifact
inspection. It does not add stable protocol/runtime claims.

Added CLI surfaces:

- `hardkas zk capabilities --json`
- `hardkas zk proof inspect <path> --json`
- `hardkas zk proof verify-local <path> --json`
- `hardkas zk corpus verify fixtures/toccata-v2/zk --json`
- `hardkas vprogs capabilities --json`
- `hardkas vprogs status --json`
- `hardkas vprogs inspect <artifact> --json`
- `hardkas programmability capabilities --json`
- `hardkas programmability corpus verify fixtures/toccata-v2 --json`
- `hardkas programmability inspect <path> --kind silver|zk|vprog --json`
- `hardkas programmability app plan --kind full-lab --json`

Added SDK surfaces:

- `await hardkas.zk.capabilities()`
- `await hardkas.zk.proof.inspect(path)`
- `await hardkas.zk.proof.verifyLocal(path)`
- `await hardkas.zk.corpus.verify(path)`
- `await hardkas.vprogs.capabilities()`
- `await hardkas.vprogs.status()`
- `await hardkas.vprogs.inspect(path)`
- `await hardkas.programmability.capabilities()`
- `await hardkas.programmability.corpus.verify({ path })`
- `await hardkas.programmability.inspect({ kind, path })`
- `await hardkas.programmability.app.plan({ kind })`

Added fixtures and scripts:

- `fixtures/toccata-v2/zk` with Groth16 fixture-coherence corpus and RISC0
  inspect-only corpus.
- `fixtures/toccata-v2/vprogs/inspect-only-artifact.json`.
- `pnpm zk:corpus`.
- `pnpm vprogs:check`.
- `pnpm programmability:corpus`.
- `pnpm programmability:examples`.
- `pnpm programmability:templates`.
- `pnpm programmability:surface`.

Builder surface boundaries:

- SilverScript builder status is `SILVERSCRIPT_BUILDER_READY`.
- ZK corpus status is `ZK_CORPUS_SURFACE_READY`.
- Groth16 verification is local fixture coherence only, not a production
  cryptographic setup or on-chain verifier claim.
- RISC0 local verification returns
  `RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED` /
  `RISC0_VERIFIER_UNAVAILABLE` in 0.9.1-alpha.
- vProgs artifact inspection status is `VPROGS_INSPECT_SURFACE_READY`.
- `ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED`.
- `VPROGS_STABLE_API_NOT_CLAIMED`.
- No mainnet, bridge, trustless exit, full vProgs runtime, or VM/consensus
  equivalence claim is added.

### Validation

- SDK parity tests added for capabilities, localnet status, corpus verify, and
  Silver planning/simulation/compare.
- `pnpm postrelease:break` reports CLI/SDK parity PASS for capabilities,
  localnet status, accounts list, corpus verify, and Silver high-level
  planning/simulation/compare.
- No new mainnet, custody, VM simulation, consensus validation, or trustless
  bridge claim is made.

## 0.9.0-alpha - Toccata Local-First Baseline - 2026-06-09

### Toccata v2 Localnet Baseline

HardKAS 0.9.0-alpha includes a normalized Toccata v2 localnet baseline with
Docker simnet funding, real standard transaction lifecycle, real Silver OP_TRUE
deploy/spend, artifact-coherence simulator comparison, mainnet guard
enforcement, and a machine-verifiable golden corpus integrated into the Toccata
gauntlet.

Included:

- Normalized Toccata v2 localnet profile.
- Docker simnet funding fixture.
- Toccata miner/stratum companion integration.
- Standard tx lifecycle real gauntlet.
- SilverScript local OP_TRUE deploy/spend baseline.
- `pnpm gauntlet:toccata` as release gate.
- Mainnet guard remains enforced.

### Release Gates

- `pnpm build`: PASS
- `pnpm test`: PASS
- `pnpm corpus:toccata`: PASS
- `pnpm gauntlet:toccata`: PASS
- CLI tests: 157 PASS
- `git diff --check`: PASS

### Silver/Toccata Simulator Claims

- `artifactCoherence`: READY_MATCH
- `runtimeOutcome`: PARTIAL
- `vmConsensusEquivalence`: NOT_CLAIMED
- `mainnet`: BLOCKED_BY_POLICY

`silver simulate compare` now supports `artifact-coherence`,
`runtime-outcome`, and `strict` modes. The default `artifact-coherence` mode
reports `SILVERSCRIPT_SIMULATION_MATCH` for the golden OP_TRUE flow while
preserving `PARTIAL_VM_SIMULATION` as an explicit known limitation. Full Kaspa
VM or consensus equivalence is not claimed.

Known limitations:

- Runtime outcome simulation is `PARTIAL`.
- Full VM/consensus equivalence is `NOT_CLAIMED`.
- Strict compare may still show runtime identifier drift.
- Mainnet remains `BLOCKED_BY_POLICY`.

### Golden Corpus

- Added a verified OP_TRUE Silver/Toccata corpus under
  `fixtures/toccata-v2/silver/op-true`.
- Added a verified failure corpus under `fixtures/toccata-v2/silver/failures`.
- Added `hardkas corpus verify <path> --json`.
- Added `pnpm corpus:toccata`.
- Integrated corpus verification into `pnpm gauntlet:toccata`.

## [v0.7.7-alpha] - 2026-06-01

### SDK Productization & DX Hardening

This release converts HardKAS from a pure CLI-first runtime into a fully consumable SDK, resolving key frictions identified during the Phase 6 and Phase 7 Gauntlets.

#### Public SDK Facade

- **`Hardkas.create()`**: New programmatic entrypoint for seamless developer orchestration.
- **`tx.*` API**: Added `plan()`, `sign()`, `send()`, and `status()` facade wrappers.
- **`accounts.*` API**: Added `list()`, `balance()`, and `fund()`.
- **`artifacts.*` API**: Added `list()` and `get()` for direct artifact access.

#### Developer Experience (DX)

- **Actionable Errors**: `tx.plan()` now intercepts `--amount 0` for value transfers and throws an actionable message regarding future anchoring capabilities.
- **Alias Resolution**: `--required-signers` now supports clean account aliases (e.g., `alice,bob`) instead of requiring full addresses.
- **Bridge Artifacts**: L2 bridge commands (`local plan` and `simulate`) now natively serialize and persist `hardkas.bridge.localPlan.v1` and `hardkas.bridge.localSimulation.v1` diagnostics, even in uninitialized workspaces.
- **CLI Discovery**: The auto-generated CLI surface documentation (`docs/reference/cli.generated.json`) now recursively parses Commander subcommands and exports `totalCommands` and `flatSurface`, providing accurate coverage tracking for testing pipelines.
- **Node Packaging**: Removed `workspace:*` constraints inside `@hardkas/sdk`, enabling flawless installation in external Node/React projects.

## [v0.7.6-alpha] - 2026-05-29

### Bug Bash & Canonicalization Hotfixes

This release focuses on strict bug fixes discovered during the Agentic E2E Gauntlet and hardening canonicalization rules.

#### Canonicalization (Strict Determinism)

- **Root Undefined Error**: `canonicalStringify(undefined)` now strictly throws an error instead of producing invalid JSON strings, preventing ambiguity at the artifact root.
- **Array Null Handling**: `undefined` values inside arrays are now safely converted to `null` to respect standard JSON serialization formats.
- **Property Omission**: Preserved the semantic exclusion of `undefined` properties in objects for backwards compatibility and correct hash generation.

#### Bug Bash Fixes

- **Workflow Offline/Simulated**: `workflow run` now correctly processes simulated networks offline with a `--timeout` flag, preventing eternal hangs when RPC is missing.
- **Replay Verify Paths**: `hardkas replay verify <path>` strictly respects arbitrary file or directory paths via `fs.statSync` rather than relying on relative magic resolution.
- **Local Accounts Balance**: `hardkas accounts balance --local` now cleanly reads balances directly from `LocalnetState` without querying an RPC node.
- **Dashboard Events**: Emitting `artifact.created` and `tx.confirmed` events during simulated transactions so the local Dashboard updates via SSE instantly.
- **Query SQL Guard**: Enforced SQLite backend checking in `query sql`, emitting actionable migration errors if the default filesystem backend is active.
- **WASM Keypair Errors**: Missing WASM core library (`@kaspa/core-lib`) in key generators now emits an explicit error instead of crashing silently.

## [v0.7.2-alpha] - 2026-05-27

### Stabilization & Refactor

This release focuses on cleaning, consolidating, versioning, and stabilizing the local-first runtime to prepare HardKAS for `0.7.2-alpha`. No new product architectures or fake executions were added. The focus remains on being a local-first, artifact-driven, deterministic, and replayable developer environment.

#### Version Alignment & Documentation

- **0.7.2-alpha:** Unified all package versions and references to `0.7.2-alpha`. Removed stale `0.6.1-alpha` and `0.7.0-CFC` references.
- **Honest Documentation:** Aggressively purged unsupported claims (e.g., "production ready", "trustless exit without ZK", "Kaspa L1 executes EVM"). Re-centered the messaging strictly around HardKAS being a "local-first reproducible Kaspa developer runtime."

#### Runtime Contract Freeze

- **Schema Versions:** Injected `schemaVersion` fields into all core runtime contracts (`hardkas.artifact.v1`, `hardkas.receipt.v1`, `hardkas.txPlan.v1`, etc.) to establish a stable structural baseline.
- **Backwards Compatibility:** Maintained compatibility for older workspaces without `schemaVersion`.

#### CLI Semantics

- **JSON Standardization:** Audited and tightened CLI commands in `--json` mode to guarantee pure, parsable JSON to `stdout` with no ANSI escapes.
- **Error Routing:** Enforced strict routing of warnings and diagnostic errors to `stderr` in JSON mode.
- **Exit Codes:** Ensured deterministic exit codes for invalid flags, missing arguments, and unsupported commands.

#### Artifacts & Corpus

- **Golden Corpus:** Populated `packages/testing/src/fixtures/golden/` with baseline JSON files representing minimum required fixtures to prevent semantic regressions.
- **Output Standardization:** Adjusted `hardkas artifact inspect`, `hardkas replay verify`, and `hardkas torture matrix` string outputs to be fully deterministic (`passed`, `diverged`, `unsupported`).

## [v0.5.6-alpha-rc.1] - 2026-05-22

### Architecture (P0 & P1 Series)

This release candidate consolidates HardKAS from a deterministic runtime into a deterministic runtime that can securely explain itself. The major focus was establishing state authority, observability, and robust introspection tooling.

#### P0: State Authority Consolidation

- **Filesystem as Primary Authority**: Removed SQLite as a state authority. SQLite now functions strictly as a projection/cache layer.
- **Deterministic State Boundaries**: Clarified state boundaries and ensured reproducible replay paths.
- **Unified Event Invalidation**: Consolidated the event invalidation lifecycle.

#### P1: Observability & Introspection

- **Event Timeline**: Added a comprehensive `EventsPage` dashboard for diagnosing state mutations and operations.
- **Provenance Graph**: Added a visual causal lineage tree (`ProvenanceGraph`) inside the dashboard to track the evolution of state via `lineageIds`.
- **Consistency Visibility**: Added deterministic debugging and visibility tooling to expose broken causality explicitly rather than hiding it.

#### P1.5: Runtime Introspection Hardening

- **Replay Honesty**: Upgraded transaction replay architecture to detect divergences between structural state, deterministic parameters (e.g. amounts, hashes), and runtime noise (e.g. timestamps).
- **Corrupted Artifact Handling**: Added a robust banner (`ArtifactCorruptedBanner`) to the dashboard ensuring corrupted state is never silently skipped or projected.
- **Strict Consistency Doctor**: Added the `--strict` and `--consistency` flags to `hardkas doctor` which actively validates filesystem invariance and halts operations if integrity is breached.

#### P1.6: Visual Regression Hardening

- **Playwright Suite**: Transitioned dashboard UI testing to Playwright with a full visual-regression baseline using deterministic mock fixtures (`pnpm test:visual:ci`).
- **Resilient Locators**: Stabilized visual tests with fallback logic and explicit states.

#### P1.7: Stabilization Burn-In

- **Burn-In Validation**: Performed deep verification of the snapshot/replay system to prove SQLite could be deterministically dropped and correctly re-derived from `.hardkas/artifacts`.
- **Noise vs Determinism Testing**: Validated `hardkas replay diff` successfully categorizing execution timestamp shifts as "Runtime Noise (Layer 3)" and mutation changes as "Deterministic Divergences (Layer 2)".
- **UI Render Stability**: Confirmed SSE reconnects and complex lineage trees render performantly.

### Breaking Changes

- **SQLite Projection Purge**: Because SQLite is no longer authoritative, running `hardkas query store rebuild` or a `snapshot replay` will forcibly truncate the SQLite cache and completely rebuild it from `.hardkas/artifacts`. Any data written to SQLite outside of the deterministic event loop will be destroyed.
- **Simnet Network Alias Deprecation**: The `simnet` network alias is deprecated in favor of `simulated` for local deterministic workflows.

### Migration Notes

- If your previous workspace relied on SQLite as the primary source of truth rather than `.hardkas/artifacts`, you may experience a `[ARTIFACT_HASH_MISMATCH]` during the next startup as the system synchronizes state. Run `hardkas doctor --consistency --strict` to inspect filesystem anomalies.

### Known Limitations

- Please refer to `KNOWN_LIMITATIONS.md` for full documentation regarding the boundaries of replay determinism, snapshot guarantees, and tooling applicability.

