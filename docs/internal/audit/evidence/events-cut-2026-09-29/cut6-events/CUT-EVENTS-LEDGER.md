# Surface Cut · item 3 · events / UtxoContext — ledger

Rule: prove substitution before deleting. The repo is read-only in this phase: built
packages plus the canonical localnet, with nothing written to the repo. Every run is
kept and classified. Order approved by the reviewer: network parameters → dead code →
**events/UtxoContext** → GHOSTDAG → PSKT decision → serialization/addresses/keys.

Base: HEAD a9672c5a7. The uncommitted tree holds only the `@hardkas/testing` change
(3 files, awaiting the owner's commit) and the parallel session's `site/index.html`.

## 1. Surface map (read-only, verified)

| Piece | What it is | Callers |
|---|---|---|
| `@hardkas/rpc-events` (published) | `DefaultReactiveEventProvider` + `SubscriptionManager` + backoff + "reconciliation" + `SimulatedTransport` | only sdk `hardkas.events` |
| sdk `hardkas.events` (index.ts:246) + `observe/transport.ts` `KaspaRpcTransportAdapter` | public SDK API over `this.rpc.subscribeToUtxosChanged` | none internal; `query.ts` deprecation notes point users to it |
| kaspa-rpc `JsonWrpcKaspaClient.subscribeToUtxosChanged` / `…VirtualChainChanged` | multiplexed over the official session; `session.onConnect` re-attaches listeners and node subscriptions | toolkit `WalletSubscriptionManager`, sdk transport |
| kaspa-rpc `upstream/session.ts` | official `RpcClient`, `strategy: "fallback"`; reconnect is lazy: "connects on first use and again after the node went away" (on the next `request()`) | every JsonWrpcKaspaClient |
| toolkit `WalletSubscriptionManager` → `WalletToolkit.watch()` (wallet.ts:160) | txid-deduped watch over kaspa-rpc | public toolkit API |
| kaspa-rpc `internal/resilient-subscriber.ts` | exported through `./internal/*` and a tsup entry | only its own test and `testing/test/gate-subpath-exports.test.ts` |
| tx-builder `createUtxoContext` | 30-line wrapper: upstream `UtxoProcessor` + `UtxoContext`, without the reconnect rule | only its own test |

Stray build outputs are tracked in `packages/rpc-events`: 41 files in total, of which 26
are compiled `.js` and `.d.ts`: 18 in `src/` and 8 in `test/`.

## 2. Method

A live differential: the same node and the same fresh simnet address A. A's key stays in
memory and is never printed.

1. Phase 1: the miner mines to A.
2. Phase 2: `docker restart` of the node, then mining again.

Observers:
- `hardkas.events`, as the SDK wires it and after `events.connect()`, with a transport spy underneath;
- toolkit watch;
- kaspa-rpc idle, and kaspa-rpc with one `getBlockDagInfo` every 2 s;
- upstream `UtxoContext` with the documented reconnect rule (`clear()` + `trackAddresses()` on every later `connect`), and without it;
- raw upstream `RpcClient`, never resubscribed and resubscribed on `connect`;
- a control: a fresh `RpcClient` subscription opened after the node is back. It is the phase-2 reference.

Ground truth is `getUtxosByAddresses([A])` through a fresh upstream client.

Scripts and outputs live in the session scratchpad `cut6-events/`: `events-diff*.mjs`,
`events-diff-N.{log,json}`, `shape-probe*.{mjs,log}` and `removed-probe*.{mjs,log}`.

## 3. Runs (all kept)

| Run | Harness | Classification |
|---|---|---|
| 1 | v1 | **Harness fault.** Upstream payloads are WASM class instances (`TransactionRecord` needs `serialize()`; `UtxoEntryReference` exposes getters), so both upstream observers read 0 outpoints although 1416 events arrived. The kaspa-rpc and toolkit signal is valid: 802/802 before the restart, then only 1–3 late notifications. |
| shape-probe-1 | — | Real payload shapes recorded, used by v2. |
| 2 | v2 | **Harness fault.** The miner ran unthrottled, unlike the canonical localnet (`--throttle 5`, `toccataMinerArgs`). The node lagged and never went quiet: 717 → 825 three seconds apart, then 2523 right after the restart. Liveness measured against the control is still valid: resumers 5153/5153, idle observers 0. The spy showed `hardkas.events` subscribed once with 0 deliveries, which led to finding F5. |
| 3 | v3 | Canonical miner; quiet at every snapshot, and the restart does not change the set (1313 → 1313). Liveness has the same pattern as run 2. `UtxoContext` state is exact. **Harness fault:** every reconstructed set was 0, because it applied `added` before `removed`; see removed-probe. |
| removed-probe-1/2 | — | In each `utxos-changed`, `removed ⊆ added` of the same notification: 11134/11134, same amount, different `blockDaaScore`. The node re-reports an outpoint whose DAA score changed. The correct order is removed first. No HardKAS code rebuilds sets from `removed`. |
| SDK config probe | — | `Hardkas.open(dir)` gives `network: "simulated"` and `LocalnetSimulatedProvider` for a config whose `execution.default` is localnet/simnet. See F5. |
| 4 | v4 | **Clean. This is the evidence run.** The canonical miner was used, the node was quiet at all three snapshots (1268, 1268 right after the restart, 2468), and there were no harness errors. The SDK was opened with `network: "simnet"`, so `hardkas.rpc` is a `JsonWrpcKaspaClient` pointing at the node. |

Run 4 table. After-restart coverage is measured against the control (1200 UTXOs). The end set is compared with the node's 2468 UTXOs.

| Observer | Phase 1 | After restart | End state vs node |
|---|---|---|---|
| `hardkas.events` as wired (no `connect()`) | 0/1268 | 0/1200 | — (0 remote subscriptions) |
| `hardkas.events` after `connect()` | 0/1268 | 0/1200 | — (transport got 1019 notifications = 1268/1268; provider passed 0) |
| toolkit watch | 1268/1268 | **0/1200** | — |
| kaspa-rpc, idle | 1268/1268 | **0/1200** | 1268: stale, missing 1200 (session still disconnected at the end) |
| kaspa-rpc + a call every 2 s | 1268/1268 | 1200/1200 | **2468 = node** (0 missing, 0 extra) |
| UtxoContext + documented reconnect rule | 751/1268 ¹ | 683/1200 ¹ | **1951 listed + 517 stasis = 2468 = node**, 0 not on node |
| UtxoContext without the rule | 751/1268 ¹ | **0/1200** | 751 + 517 = 1268: stale |
| RpcClient, never resubscribed | 1268/1268 | **0/1200** | 1268: stale (the client reconnected by itself, but the node subscription was lost) |
| RpcClient, resubscribed on `connect` | 1268/1268 | 1200/1200 | **2468 = node** |
| control (opened after the restart) | — | 1200/1200 | 1200: missing 1268, as expected for a subscription with no initial scan |

¹ UtxoContext emits events only once a coinbase UTXO leaves stasis: 751 = 1268 − 517 and 683 = 1200 − 517. Upstream documents this ("process transactions only when they have reached the pending stage"). Its state holds the stasis entries too.

Run 3 shows the same pattern: UtxoContext 294+484+535 = 1313 and 1515+501+548 = 2564, both exactly equal to the node.

## 4. Findings

- **F1 · `hardkas.events` (sdk + `@hardkas/rpc-events`) never delivers a UTXO event from a real node.**
  - As the SDK wires it, it never subscribes. The provider only subscribes when its manager is "connected", and the SDK never calls `connect()`.
  - After `connect()`, the node's notifications reach the transport (1019, 1268/1268), but the provider's address filter drops them all. `reactive-event-provider.ts:161` compares addresses with `u.scriptPublicKey.scriptPublicKey`. A HardKAS UTXO's `scriptPublicKey` is a string, so that value is `undefined`. The line after it is marked "Hack for sim".
  - It has no reconnect (inherits F2), and its reconciliation is mocked ("We mock that behavior for now").
  - Its tests run only against `SimulatedTransport`.
  - There is no behaviour to preserve.
- **F2 · kaspa-rpc subscriptions die silently on a node restart unless something else calls the same client.**
  - The session connects with `strategy: "fallback"` and reconnects lazily on the next `request()`.
  - Its own unit test encodes that (`subscriptions.test.ts:119`: "the next call opens a new official client").
  - Idle, it saw 0 after the restart in runs 1–4. With traffic it resumes, and its set is exact in run 4.
  - `WalletToolkit.watch()` inherits this and saw 0 after the restart in every run.
- **F3 · Upstream `UtxoProcessor` + `UtxoContext` with the documented rule substitutes and improves.**
  - The rule is `clear()` + `trackAddresses()` on every later `connect` (kaspa.d.ts: "IMPORTANT: This function must be manually called when disconnecting or re-connecting to the node").
  - It is live after the restart, and its state equals the node's at every quiet point, including stasis counts.
  - It adds maturity, reorg and balance handling that HardKAS does not have.
  - Without the rule it goes stale, as upstream warns.
  - `trackAddresses` scans and then registers, so a re-registration re-reads state. A resubscription alone is correct only if nothing changed while disconnected. Run 4's quiet restart did not exercise that gap; a deterministic gap test is available if wanted.
- **F4 · Raw upstream `RpcClient` reconnects on its own (default Retry), but the node-side subscription is lost.**
  - Resubscribing on `connect` restores it: 1200/1200, and the set is exact in run 4.
  - This is the minimal fix pattern for F2, if kaspa-rpc subscriptions stay.
- **F5 · Separate ticket, not events: `Hardkas.open(dir)` ignores the config `execution` contract.**
  - With `execution.default: "localnet"` (simnet), `hk.network` is `"simulated"` and `hk.rpc` is `LocalnetSimulatedProvider`.
  - The cause: sdk index.ts:268 reads `defaultNetwork`. The config default is `"simulated"`, and config `resolve.ts` calls that field deprecated in favour of `execution`. The CLI resolves through `execution`.
  - `hardkas init` scaffolds `execution.default: "simulator"`, so fresh projects are consistent. Users who switch to localnet the documented way get the simulator from the SDK.
  - Workaround: `Hardkas.open({ network: "simnet" })`.
- **F6 · Node semantics, for any future consumer.** `utxos-changed` re-reports an outpoint whose `blockDaaScore` changed as removed + added in the same notification (11134/11134, same amount). Consumers must apply removed before added. No HardKAS code rebuilds sets from notifications today.
- **F7 · Hygiene.** `packages/rpc-events` tracks 26 compiled `.js`/`.d.ts` files in `src/` and `test/`.

## 5. Proposed cut (needs reviewer/owner approval — nothing deleted)

Each step is atomic and carries a regression, the packed-consumer proof (the permanent rule) and the gate.

- **3a · Remove `hardkas.events` + `@hardkas/rpc-events` + `sdk/src/observe/transport.ts`.**
  - Why: F1 shows nothing works to preserve. There are no internal callers.
  - The substitute for users who watch addresses is upstream `UtxoContext` with the reconnect rule (F3), documented in the SDK docs.
  - Scope:
    - sdk `index.ts` (field and import) and the sdk manifest dependency;
    - the whole `packages/rpc-events` (41 tracked files, F7 included);
    - the `query.ts` deprecation notes that point to `hardkas.events`;
    - the line in `testing/test/gate-subpath-exports.test.ts`;
    - `PUBLIC_API_SURFACE.md`, the generated docs and the lockfile.
  - npm deprecation of the published package is the owner's action.
  - This removes public API, so it is a surface decision.
- **3b · Watch liveness: decide one of the two.**
  - (i) Replace the engine of `WalletToolkit.watch()` with `UtxoContext` + the rule (F3). This is my recommendation: it is the wallet-level upstream primitive with state, maturity and reorg.
  - (ii) Keep it and fix kaspa-rpc: reconnect on disconnect and resubscribe on connect (F4). This needs a live restart regression.
  - After 3a plus 3b(i), kaspa-rpc's subscription surface has no runtime callers. That surface is `subscribeToUtxosChanged`/`…VirtualChainChanged`, the `onConnect` restore, and the load-balancer, localnet and mock implementations. It would then be listed as published API with no consumer, for its own decision.
- **3c · Dead pieces, with no substitution question.**
  - `kaspa-rpc/internal/resilient-subscriber.ts`: test-only, but published through `./internal/*` and a tsup entry. Remove it with its test and the gate-subpath line; approval is needed as for any published surface.
  - tx-builder `createUtxoContext`: test-only. It either becomes the one HardKAS helper that wraps `UtxoContext` + the rule (used by 3b(i)), or it is deleted.
- **Not in this cut:**
  - F5 gets its own ticket;
  - F6 is a note for future consumers;
  - `sync-daemon` (only labs apps) and `IndexerToolkit.watch` (local bus, not RPC) stay out.

Recommended order: 3a → 3b → 3c.

## 6. Reviewer decision (29-sep) and 3a status

The reviewer endorsed the order 3a → 3b → 3c as three separate changes ("No mezclaría las tres cosas en un único borrado grande"). F5 gets its own ticket and its own regression.

**3a, in progress and PAUSED: the permission classifier blocked the deletions.**

Before baseline, at HEAD fdc1d2ddc (done; nothing written to the repo):
- `pnpm build`: 47/47, then the pskt-native binary was restored.
- typedoc before: `%TEMP%\hk-3a\typedoc-before`, 599 files.
- `packed-smoke` before: 33 tarballs, no leaks.
  - npm consumer: 25 @hardkas packages (rpc-events included, pulled in by the sdk), 145 third-party, 31 imports OK, CLI 7/7.
  - strict pnpm: 33 packages, 150 third-party, 39 imports OK, CLI 7/7.
  - Both fail only `testing/setup` and `testing/scenarios` for lack of vitest, which is expected with the optional peer.
- New regression `packages/sdk/test/surface-cut-events.test.ts` on HEAD: FAILS 2/2 as intended (events in sdk = true; manifest has `workspace:*`). Log: `phase1/3a-regression-on-head.*`.

Applied in the working tree (uncommitted, INCOMPLETE):
- `sdk/src/index.ts`: the rpc-events and transport imports, the `events` field and its construction are removed.
- `sdk/package.json`: the dependency is removed.
- `sdk/src/query.ts`: the 3 deprecation notes no longer name `hardkas.events`.
- `testing/test/gate-subpath-exports.test.ts`: `rpc-events` → `jobs`, another main-only package.
- The new regression test.

Blocked:
- Deleting `packages/rpc-events/` and `packages/sdk/src/observe/transport.ts` ("Modify Shared Resources").
- Saving the edits to a scratchpad patch before restoring the tree ("Irreversible Local Destruction").

As it stands, the tree is inconsistent: the sdk manifest and the lockfile disagree, and `transport.ts` still imports rpc-events. **It must not be committed as is.**

**Owner decision, 29-sep: option 1.** The owner authorised deleting only `packages/rpc-events/` and `packages/sdk/src/observe/transport.ts`, and continuing 3a to closure.
- Limits: no `WalletToolkit.watch`, `UtxoContext`, `resilient-subscriber`, `createUtxoContext`, `sync-daemon`, L2/bridge or `docs/internal/audit`; no commit, push, bump or publish.
- Closure criteria:
  - the packed sdk no longer exposes `events`;
  - no published package requires rpc-events;
  - an external consumer cannot resolve it from the monorepo;
  - the rest of the SDK and CLI behave as in the "before" baseline.
- STOP before 3b.

### 3a · done, uncommitted (evidence in `%TEMP%\hk-3a\`)

Deletions:
- `safe-rm.mjs packages/rpc-events` removed 114 files and 22 directories.
- It unlinked 3 links without following them: `@hardkas/core` → `packages/core`, plus typescript and vitest into the root store. `packages/core` is intact.
- `transport.ts` was removed. Tracked deletions in rpc-events: 41.

Lockfile: `pnpm install` (9.15.4) produced exactly −16 lines: the rpc-events importer (13) and the sdk edge (3). The `@emnapi/runtime` peer warning was already there.

Build and typecheck:
- Build after: 46/46, one task fewer. The pskt binary was restored.
- `turbo typecheck --filter=...@hardkas/sdk`: 54/54 tasks, 62 packages in scope.

Tests:
- Focused: 8/8, the regression plus gate-subpath.
- The regression fails 2/2 on HEAD.

typedoc, before vs after: 3 files change. 87 lines are only "Defined in index.ts:N" shifts. The real changes are the removed `Hardkas.events: ReactiveEventProvider` block and the 3 `HardkasQuery` notes. Not applied to `apps/docs`, and `PUBLIC_API_SURFACE.md` is not edited either:
- both are regenerated by the owner's release flow;
- `PUBLIC_API_SURFACE.md` declares itself the rc.26 published snapshot.

The diff is kept in `typedoc-3a.diff`.

Tarball scan (`tarball-scan.mjs`, every file of every tarball):
- Before: 33 packages, 542 files. The sdk manifest, `dist/index.js` and `dist/index.d.ts` required it, and the rpc-events tarball also shipped its compiled tests.
- After: 32 packages, 488 files. There are **0 mentions** in manifests or files (the cli bundle included).

Surface probe (`sdk-surface-probe.mjs`, copied into each consumer), before → after, identical in npm and strict pnpm:
- `events in hk`: true → **false**. The only member removed is `events`.
- 49 exports and the prototype: identical.
- sdk `d.ts` mentions: `dist/index.d.ts` → none.
- `import('@hardkas/rpc-events')` from the consumer: RESOLVED → **ERR_MODULE_NOT_FOUND**.
- CJS resolve from the installed sdk: resolved → **MODULE_NOT_FOUND**.
- Node search dirs inside the monorepo: 0 of 14 (npm) and 0 of 16 (pnpm), before and after. NODE_PATH is unset.
- Probe run 1 failed on a harness fault: ESM resolves from the script's location, not the cwd. It is kept as `probe-before-*-run1-wrong-module-location.txt`.

Consumer comparison (`compare-consumers.mjs`):
- Run 1 had harness faults and is kept as `compare-consumers-run1-harness.json`:
  - an iterator consumed inside `minus`;
  - order-sensitive manifest comparison;
  - truncated error text.
- Run 2, the only differences:
  - packs 33 → 32 (rpc-events);
  - the sdk dependency.
- All other 31 manifests are identical.
- npm: @hardkas 25 → 24; third-party 145 = 145 (same set); imports 31 → 30 (only rpc-events).
- pnpm: @hardkas 33 → 32; third-party 150 = 150; imports 39 → 38.
- In both:
  - the same 2 failures (`testing/setup` and `testing/scenarios`: vitest missing, the optional peer);
  - CLI 7/7 with 0 differences in status, json or normalised output;
  - `plan.json` identical after normalising.

Fresh project (`scaffold-compare.mjs`):
- The scaffold is the same, `{@hardkas/sdk}` only.
- rpc-events installed: true → false. `events` on the instance: true → false. Packages: 162 → 161.
- `npm test`: 1 passed in both. The 8 steps are identical.

Gate `3a-gate1`: **PASS on the first run, 2014 / 0 / 28**, 897 files, 713 s, 0 non-loopback. This is the prediction exactly: 2022 − 10 rpc-events tests + 2 regression tests.

Foreign change noticed after the gate: `packages/cli/src/commands/accounts.ts` (3 help strings), last written 17:36:49. The gate ran 17:24:44–17:36:37. It is the parallel session's CLI-text work; not touched, not part of 3a.

Files for the owner's commit:
- M `packages/sdk/package.json`, `packages/sdk/src/index.ts`, `packages/sdk/src/query.ts`, `packages/testing/test/gate-subpath-exports.test.ts`, `pnpm-lock.yaml`
- D `packages/sdk/src/observe/transport.ts` and `packages/rpc-events/**` (41)
- ?? `packages/sdk/test/surface-cut-events.test.ts`

NOT 3a: `site/index.html` and `packages/cli/src/commands/accounts.ts`.

Open for the owner:
- `npm deprecate @hardkas/rpc-events`, at their discretion;
- the docs regeneration at the next release.

## 7. 3b gap experiment: the record run (29-sep evening)

The design, `3b-GAP-EXPERIMENT-DESIGN.md`, was approved by the reviewer with its criterion fixed before any result. The order was: a gate on HEAD, then ONE record run whose first result is kept. Preconditions, all met:
- the tree clean at 07354a24b;
- no canonical localnet;
- the offline self-test at 14/14;
- the dists the run uses unchanged since my last build: `git diff fdc1d2ddc..HEAD` over core, kaspa-rpc, localnet, node-orchestrator, config and localnet-runners is empty.

**Gate on HEAD 07354a24b** (`phase1/head-07354a24b-gate1`): PASS on the first run, 2021 / 0 / 28, 0 non-loopback. Compared with 3a's gate, the +7 tests are exactly the two new files of 07354a24b: `help-truth` (4) and `fund-amount` (3). This qualifies what c620edbff and 07354a24b added on top of 3a.

**Record run** (`gap-record-1.json`, `.log`, `.snapshots.json` of 2.9 MB, `.verify.json`): verdict **UTXOCONTEXT_REQUIRED**, V1–V7 all true, 0 errors.

Setup:
- Funding to A gave 1347 UTXOs. Maturation to C ran until DAA 21450: wallet coinbase maturity 1000 + stasis 500, consensus 1000 (`core.getCoinbaseMaturity`), margin 50.
- T0 = 1376. The +29 over the funding count comes from A's blocks merged late, whose rewards are paid by the coinbases of chain blocks mined to C, as Kaspa rewards work. T0 was taken after quiet, before any candidate existed.

Gap spend, while the proxied candidates were cut off:
- tx a380f3f9…: 2 inputs of A (…bc50:0, …bc50:1) and 1 change (a380f3f9…:1).
- Proxy: 0 sockets and 0 connections accepted during the gap. R and U disconnected and did not reconnect before the heal.

Snapshots (extra / missing against the fresh truth):
- **before-gap:** L, R, U, K and U0 are all exact (1376). U has stasis 0 and pending 0.
- **during-gap:** L is exact (live). R, U, K and U0 each have extra 2 (the gap inputs) and missing 1 (the change).
- **after-reconnect:** **U exact.** **R has extra = exactly the 2 gap inputs and missing = exactly the change.** K (kaspa-rpc lazy restore) is the same as R. U0 (no rule) is the same.
- **after-control-spend** (tx 7993e4b8…, inputs …bc50:10 and :11, change 7993e4b8…:1): **U exact.** **R applied the control spend live but keeps exactly the inherited gap.** K is the same as R. U0 has extra 4 and missing 2: it missed both spends.

**Independent verification** (`verify-gap-record.mjs`: set arithmetic on the raw snapshots, without gap-lib or `decide()`): every decisive fact holds.
- The node: `T_gap = T0 − inputs + change`, amounts unchanged, `T3 = T2 − postInputs + postChange`.
- L equals the truth at all 4 checkpoints.
- R's difference is exactly the gap delta at after-reconnect and at after-control-spend.
- U equals the truth, outpoints and amounts, at both.

**Reading, pre-agreed:** resubscribing (R, and today's kaspa-rpc restore K) does not recover what changed while disconnected. The gap stays as phantom spent inputs plus a missing change, even though live changes resume. `UtxoContext` with `clear()` → `trackAddresses()` re-snapshots and converges exactly. This is evidence for 3b(i).

Per the reviewer, 3b is **not** started: first the experiment report and its review, then an explicit implementation decision.

After the run, the localnet was stopped, the miner removed, and the tree left clean at 07354a24b.

## 8. 3b implementation (GO from the owner, 29-sep): uncommitted, paused at step 8

**Authorised order:**
1. R1–R4 before production;
2. BEFORE on HEAD;
3. confirm the failure reasons;
4. implement 3b only;
5. targeted AFTER;
6. full package tests;
7. tarball + external consumer;
8. the partition experiment;
9. the full gate;
10. STOP before 3c.

**Limits:**
- no kaspa-rpc, no `Hardkas.open`/`execution.default`, no 3c, no other subscription surfaces;
- W10–W12 are closure requirements;
- plus the race regression: two reconnects while the first resync is held, then `unwatch`.

**Steps 1–3 (BEFORE, production untouched, HEAD 07354a24b):**
- R1 is `tx-builder/test/utxo-context-reconnect.test.ts` (6 tests). R2–R4 are `toolkit/test/wallet-watch-utxocontext.test.ts` (12 tests, with the race test R2b).
- BEFORE-1 (`phase1/3b-before-R1-R4-on-head.*`): 17/18 fail, and the guard "first registration not repeated" passes. Reasons:
  - R1: no reconnect rule (`expected [] …`), and `onResync`/`onError` missing;
  - R3: resolved instead of rejecting (the silent no-op);
  - W6: kaspa-rpc subscribe called;
  - R2/R4: "RPC client with subscription support is required for watch()", i.e. the old engine.
- **Upstream probe** (`upstream-events-probe-1.json`, live, no repo writes). UtxoProcessor has no "external" event.
  - A spend this context did not create arrives as a `maturity` record of type "external", keyed by the transaction whose outputs were spent, with those outputs as entries.
  - The change arrives as `pending`/"incoming", keyed by the spender.
  - The context state is already fully updated at the first event, so state-diffing would mislabel the txid. The engine therefore maps records as they come.
  - The R2/R4 fake emitted a non-existent "external" event. It was corrected to the measured shape BEFORE production changed.
- BEFORE-2 (`phase1/3b-before2-R1-R4-on-head.*`): the same 17 failures for the same reasons. Both runs are kept.

**Step 4 (implementation):**
- tx-builder `createUtxoContext` gains the rule (clear → trackAddresses on every reconnect after the first registration). One pass at a time; reconnects during a pass are merged into one more pass; `stop()` waits for the in-flight pass, and nothing registers after it. Additive: `resyncing`, `onResync`, `onError`.
- toolkit `watch.ts` (new) `UtxoWatchEngine`:
  - its own retrying `RpcClient` from `rpcUrl`, network id from `getServerInfo`;
  - upstream records mapped: incoming/change/transfer-incoming on `pending` → added; external/reorg → removed; maturity/stasis/discovery → none;
  - deduped (LRU 1000);
  - a snapshot at "disconnect" feeds the `resync` diff; nothing is emitted while disconnected or resyncing (W10);
  - handle: `unwatch`, `utxos()` (mature + pending), `balance()` (`stasisCount` from the balance events).
- toolkit `wallet.ts`:
  - `watch()` rejects with `WALLET_WATCH_REQUIRES_NODE` when there is no `rpcUrl`;
  - watchers share one engine, stopped when the last one leaves;
  - `WalletSubscriptionManager` is untouched and still exported (3c).
- The new types are exported as types only.
- SDK `wallet.open` passes `rpcUrl: resolveRpcUrl()` only when its rpc is a `JsonWrpcKaspaClient`, as plumbing.
- `wallet-watch.test.ts` (3 tests) now targets `WalletSubscriptionManager` directly, with the same assertions; its contracts on the new engine are in R4.
- **Found during implementation, added under the same discipline: R5.** With Retry, the first `connect()` never resolves while the node is down, so `watch()` would hang forever; the old engine failed after about 30 s through kaspa-rpc.
  - R5 was written first and failed on the implementation without the fix ("Test timed out in 5000ms", `phase1/3b-R5-before-timeout.*`).
  - Then the first connection was bounded to 30 s, with `WALLET_WATCH_NODE_UNREACHABLE`. Reconnects remain unbounded.

**Step 5, targeted AFTER:**
- run 1: 30/30;
- after the R5 fix: 31/31 (`3b-after-targeted2`);
- typecheck `...@hardkas/tx-builder`: run 1 FAILED with TS2412 (exactOptionalPropertyTypes on `_watch?`, `typecheck-after-run1-exactOptional.log`), fixed to `| undefined`, then 54/54.

**Step 6, full tx-builder + toolkit + sdk tests:** 343/0/5 (`3b-after-packages`); on the final code 344/0/5 (`3b-after-packages2`).

**Step 7, packed-consumer proof** (`%TEMP%\hk-3b`, before = HEAD 07354a24b built and packed before any production change):
- Before vs after: 32 → 32 packs, **0 manifest differences**. In npm and strict pnpm, installed @hardkas and third-party sets are identical, imports identical (30/38, only the known vitest peer failures), CLI 7/7 with 0 output differences, `plan.json` identical.
- **`watch-surface-probe`** (inside each consumer):
  - Before: the toolkit without a node gives "RPC client with subscription support is required…", and `hk.wallet.open().watch()` on the SDK's default simulated network RESOLVES and never fires.
  - After: both give **`WALLET_WATCH_REQUIRES_NODE`**.
  - The packed d.ts carry the new surface (`WalletWatchEvent`, `resync`, `rpcUrl`, `onResync`, `resyncing`, `onError`) and still export `WalletSubscriptionManager`. The probe's "WalletWatchHandle: true" on the before set is a substring match of the legacy `WalletWatchHandler`.

**Step 8 was blocked, then run.**
- Docker Desktop had been closed. I did not start it; the owner reopened it.
- With the engine up, HEAD was still 07354a24b and the tree held only the 3b files.

**Step 8, the partition experiment, one record run** (`gap-w-record-1.{json,log,snapshots.json,verify.json}`):
- W = `WalletToolkit.watch()` imported from `%TEMP%\hk-3b\after\npm-consumer\node_modules\@hardkas\toolkit\dist\index.js`, i.e. the packed tarball, connected through the proxy with `rpcUrl`.
- Same design and timing as the record run. T0 = 1193. Gap spend 59880b65…: 2 inputs and 1 change. Post-heal spend 4fd2ed73…: 2 inputs and 1 change.
- V1–V7 all true, 0 errors.
- **Closure (W): PASS on the first run.**
  - `W.utxos()` equals the fresh node snapshot, outpoints and amounts, after the resync and again after the later spend.
  - Exactly one `resync` after the heal: `removed` = the 2 gap inputs, `added` = the gap change, with the node's amounts, `reason: "reconnect"`.
  - The cut never appears as a `transaction`.
  - The later spend arrives live: `removed` = its inputs, `added` = its change.
- Replication of the record run: the verdict is again UTXOCONTEXT_REQUIRED (R off by exactly the gap, U exact).
- **Independent verification** (`verify-gap-w.mjs`: raw snapshots plus W's raw event log, without gap-lib, `decide()` or the harness's `closure3b`): **19/19 facts true**.
- Afterwards the localnet was stopped and the miner removed.

**Step 9, full gate** (`phase1/3b-gate1`): **PASS on the first run, 2040 / 0 / 28**, 907 files, 713 s, 0 non-loopback.
- This is exactly HEAD's 2021 plus the two new files, `wallet-watch-utxocontext` (13) and `utxo-context-reconnect` (6).
- No file was removed and no other count changed; `wallet-watch.test.ts` still has 3 tests.

**Step 10: STOP before 3c.**

Files for the owner's commit:
- M: `packages/tx-builder/src/kaspa-wallet-adapter.ts`, `packages/toolkit/src/wallet.ts`, `packages/toolkit/src/index.ts`, `packages/sdk/src/index.ts`, `packages/toolkit/test/wallet-watch.test.ts`
- ??: `packages/toolkit/src/watch.ts`, `packages/toolkit/test/wallet-watch-utxocontext.test.ts`, `packages/tx-builder/test/utxo-context-reconnect.test.ts`

The lockfile and the manifests are unchanged.

Open, not 3b:
- 3c: `WalletSubscriptionManager` and `resilient-subscriber` now have no runtime consumer; `createUtxoContext` stays as the wrapper;
- F5, `Hardkas.open` / `execution`;
- after a failed re-snapshot while the connection stays up, the watch waits for the next reconnect. It is logged, with no retry. This is a known limit, to decide on later.

## 9. 3c: read-only inventory (reviewer, 29-sep; nothing changed in the repo)

**Baseline.** The owner committed 3b as a1e774f6e: exactly the 8 files, parent 07354a24b, tree clean, develop not ahead of origin/develop (pushed). All 8 files were last written before the qualified gate started (22:46:19), so HEAD is exactly the 2040/0/28 tree.

**Scope (reviewer).** 3c changes shape: `createUtxoContext` is now the canonical wrapper and is NOT a candidate. The question is what is really dead after 3a+3b: `resilient-subscriber`, the kaspa-rpc subscription surfaces without productive consumers, their exports and their tests. Untouched: `createUtxoContext`, `WalletToolkit.watch()`, `UtxoContext`, `sync-daemon`, `IndexerToolkit.watch()`, F5.

**Caller graph.** Production means `src` under packages, apps, labs, examples and templates, without tests.

1. **`ResilientSubscriptionClient`** (`kaspa-rpc/src/internal/resilient-subscriber.ts`, 226 lines). It wraps `JsonWrpcKaspaClient` with a heartbeat, a reconnect and a resubscription of raw topics.
   - **0 production callers.**
   - Tests: `resilient-subscriber.test.ts` (2), plus one resolver assertion in `testing/test/gate-subpath-exports.test.ts:28-30`.
   - Published: a tsup entry plus `./internal/*`. The packed tarball ships `dist/internal/resilient-subscriber.{js,d.ts}`, the only file under `internal/`, importable as `@hardkas/kaspa-rpc/internal/resilient-subscriber`.
   - Behaviour: it resubscribes without re-reading state, exactly R's mechanism, which the gap experiment measured as insufficient.

2. **The subscription members of `KaspaRpcClient`** (`kaspa-rpc/src/index.ts:174-178`): `subscribeToUtxosChanged`, `subscribeToVirtualChainChanged`, `on`, `off`.
   - Types: `UtxosChangedEvent`, `VirtualChainChangedEvent`, `RpcAcceptedTransactionIds` (used only by `VirtualChainChangedEvent`) and `KaspaSubscription`. Plus the `OFFICIAL_EVENTS` map and `ActiveListener`.
   - **Production callers after 3b: only `WalletSubscriptionManager`, which has none itself.** `on`/`off` are used only inside kaspa-rpc (the `LoadBalancedRpcProvider` delegation and `ResilientSubscriptionClient`) and in `resilient-subscriber`'s test.
   - Implementers, which all change if the members go:
     - `JsonWrpcKaspaClient`: `rawListeners`, `subscriptions`, `utxoAddressRefs`, `virtualChain`, `on`/`off`, `track`/`untrack`, both subscribe methods, and the `session.onConnect` restore hook. `upstream/session.ts`'s `onConnect`/`connectHooks` serve only that hook.
     - `MockKaspaRpcClient` (`index.ts:755-770`).
     - `KaspaJsonRpcClient` (`json-rpc-client.ts:296-302`, which throws `RPC_SUBSCRIPTIONS_UNSUPPORTED`).
     - `LoadBalancedRpcProvider` (`provider.ts:48-54`, `173-200`).
     - `ResilientSubscriptionClient`.
     - `LocalnetSimulatedProvider` in **@hardkas/localnet** (`provider.ts:27-28` and `144-160`, all no-ops that never emit).
   - Tests: `kaspa-rpc/test/subscriptions.test.ts` (9), all about this surface.

3. **toolkit `WalletSubscriptionManager`**, with `WalletWatchHandler` and `WalletSubscriptionEvent` (`toolkit/src/subscriptions.ts`, 94 lines, public through `export *`).
   - **0 production callers since 3b.** The two types are used only inside that file.
   - Tests: `toolkit/test/wallet-watch.test.ts` (3).

**Public exports affected:**
- @hardkas/kaspa-rpc main entry: 4 interface members, 4 types, and the subscription methods of 4 exported classes;
- the whole subpath `@hardkas/kaspa-rpc/internal/resilient-subscriber`;
- @hardkas/toolkit: `WalletSubscriptionManager` and 2 types;
- @hardkas/localnet `LocalnetSimulatedProvider`: its no-op methods, but only if the interface members go.

**External consumers.** None in the repo. All of it is published on npm, so external use is unknown. Public docs mention none of these APIs; only `docs/internal` audit snapshots and the `PUBLIC_API_SURFACE.md` release snapshot do.

**Tests that would disappear:**
- `resilient-subscriber.test.ts` (2);
- `wallet-watch.test.ts` (3);
- `subscriptions.test.ts` (9), only if the kaspa-rpc members go;
- 1 assertion in `gate-subpath-exports.test.ts`.

**Functionality left without an owner.** Nothing HardKAS uses: tx wait/status poll, and `watch()` is on UtxoContext. What a hypothetical external user would lose is streaming raw node notifications through HardKAS's own client. The owners already in place:
- kaspa-wasm `RpcClient` directly, for raw streams (subscribe, then resubscribe on `connect`; F4 showed liveness works);
- `createUtxoContext` / `WalletToolkit.watch()`, for UTXO state.

**Options for the decision:**
- **3c-1, narrow; the interface is unchanged:**
  - remove `resilient-subscriber` with its test, the tsup entry, the `./internal/*` export (the only file there) and the gate-subpath line;
  - remove `WalletSubscriptionManager` with its 2 types and 3 tests.
- **3c-2, the kaspa-rpc surface:** remove the 4 members from `KaspaRpcClient` and from every implementation, including localnet's no-ops. Also the 4 types, `OFFICIAL_EVENTS`, the `session.onConnect` hook and `subscriptions.test.ts`. This spans 2 packages and the kaspa-rpc main-entry API.
- Recommended order: 3c-1, then 3c-2 as its own atomic step. Each gets a BEFORE regression (guard tests), the packed-consumer proof and the gate.

**Out of scope, observations only:**
- `LoadBalancedRpcProvider` has no production consumer at all, only kaspa-rpc tests. That is a separate dead-code question.
- `MockKaspaRpcClient` IS used at runtime by the CLI bridge-local runner (L2/bridge), so it stays; only its stubs would change in 3c-2.
- **`packages/cli/out/` holds 380 tracked files of old compiled output.** For example, `out/commands/kaspa.js` still carries the old `http://127.0.0.1:16110` default. This is a hygiene item for the dead-code track.

The plan as it stood before the owner's decision:
1. The two deletions, with safe-rm (links unlinked, never followed).
2. `pnpm install` for the lockfile.
3. Build and typecheck the sdk, then restore the pskt binary.
4. Focused tests.
5. typedoc after, diffed against before (kept as evidence; the release flow regenerates the docs).
6. `packed-smoke` after.
7. `scaffold-compare.mjs` before/after.
8. The hermetic gate, expected 2022 − 10 + 2 = 2014 passed.
